import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import { pool, transaction } from './db.js'
import {
  authenticate,
  requireAdmin,
  requireAuth,
  sessionCookie,
  startSession,
  validPassword,
  validUsername,
  verifyPassword,
} from './auth.js'
import { createUser, grantWeeklyPoints, setUserActive } from './domain/points.js'
import { normalizeNickname } from './domain/profile.js'
import { ensureMatchesFresh, getStandings, syncMatches } from './football.js'
import { reverseSettlement, settleMatch } from './settlement.js'

const app = express()
const port = Number(process.env.PORT || 3000)
const root = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(root, '../dist')

app.set('trust proxy', 1)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://crests.football-data.org'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
}))
app.use(express.json({ limit: '32kb' }))
app.use(authenticate)

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '인증 요청이 너무 많습니다. 잠시 후 다시 시도하세요.' },
})

function validLoginPassword(password) {
  return typeof password === 'string' && password.length > 0 && password.length <= 100
}

function cleanUser(user) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname || user.username,
    role: user.role,
    active: user.active,
    balance: Number(user.balance),
    created_at: user.created_at,
  }
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok' })
  } catch {
    res.status(503).json({ status: 'error' })
  }
})

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { username, password } = req.body || {}
  if (!validUsername(username) || !validPassword(password)) {
    return res.status(400).json({ error: '아이디와 8~20자 비밀번호를 확인하세요.' })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  try {
    const { user, token } = await transaction(async (client) => {
      const user = await createUser(client, { username, passwordHash })
      return { user, token: await startSession(client, user.id) }
    })
    res.setHeader('Set-Cookie', sessionCookie(token))
    res.status(201).json({ user: cleanUser(user) })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: '이미 존재하는 아이디입니다.' })
    throw error
  }
})

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {}
  if (!validUsername(username) || !validLoginPassword(password)) {
    return res.status(400).json({ error: '아이디와 비밀번호를 확인하세요.' })
  }

  const result = await pool.query(
    'SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
    [username],
  )
  const user = result.rows[0]
  if (!user || !user.active || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' })
  }

  const token = await transaction(async (client) => {
    await client.query('DELETE FROM sessions WHERE expires_at <= NOW()')
    await grantWeeklyPoints(client, user.id)
    return startSession(client, user.id)
  })
  res.setHeader('Set-Cookie', sessionCookie(token))
  const refreshed = await pool.query('SELECT * FROM users WHERE id = $1', [user.id])
  res.json({ user: cleanUser(refreshed.rows[0]) })
})

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [req.sessionTokenHash])
  res.setHeader('Set-Cookie', sessionCookie('', true))
  res.status(204).end()
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: cleanUser(req.user) })
})

app.patch('/api/me/nickname', requireAuth, async (req, res) => {
  const nickname = normalizeNickname(req.body?.nickname)
  if (!nickname) return res.status(400).json({ error: '닉네임은 2~20자로 입력하세요.' })
  const result = await pool.query(
    `UPDATE users SET nickname = $1 WHERE id = $2
     RETURNING id, username, nickname, role, active, balance, created_at`,
    [nickname, req.user.id],
  )
  res.json({ user: cleanUser(result.rows[0]) })
})

app.get('/api/matches', requireAuth, async (req, res) => {
  let syncWarning = null
  try {
    await ensureMatchesFresh()
  } catch (error) {
    syncWarning = error.message
  }

  const result = await pool.query(
    `SELECT m.*,
       COALESCE(SUM(b.stake) FILTER (WHERE b.status <> 'CANCELLED' AND b.prediction = 'HOME'), 0) AS home_pool,
       COALESCE(SUM(b.stake) FILTER (WHERE b.status <> 'CANCELLED' AND b.prediction = 'DRAW'), 0) AS draw_pool,
       COALESCE(SUM(b.stake) FILTER (WHERE b.status <> 'CANCELLED' AND b.prediction = 'AWAY'), 0) AS away_pool,
       COUNT(b.id) FILTER (WHERE b.status <> 'CANCELLED' AND b.prediction = 'HOME')::int AS home_bettors,
       COUNT(b.id) FILTER (WHERE b.status <> 'CANCELLED' AND b.prediction = 'DRAW')::int AS draw_bettors,
       COUNT(b.id) FILTER (WHERE b.status <> 'CANCELLED' AND b.prediction = 'AWAY')::int AS away_bettors,
       mine.prediction AS my_prediction, mine.stake AS my_stake,
       mine.status AS my_bet_status, mine.payout AS my_payout,
       COALESCE((
         SELECT json_agg(json_build_object('nickname', u.nickname, 'stake', participant.stake) ORDER BY u.nickname)
         FROM bets participant
         JOIN users u ON u.id = participant.user_id
         WHERE participant.match_id = m.id AND participant.status <> 'CANCELLED'
       ), '[]'::json) AS bettors
     FROM matches m
     LEFT JOIN bets b ON b.match_id = m.id
     LEFT JOIN bets mine ON mine.match_id = m.id AND mine.user_id = $1
     WHERE m.utc_date >= NOW() - INTERVAL '30 days'
     GROUP BY m.id, mine.prediction, mine.stake, mine.status, mine.payout
     ORDER BY m.utc_date, m.id
     LIMIT 240`,
    [req.user.id],
  )
  res.json({ matches: result.rows, syncWarning })
})

app.get('/api/standings', requireAuth, async (_req, res) => res.json(await getStandings()))

app.put('/api/bets/:matchId', requireAuth, async (req, res) => {
  const matchId = Number(req.params.matchId)
  const prediction = req.body?.prediction
  const stake = Number(req.body?.stake)
  if (!Number.isSafeInteger(matchId) || !['HOME', 'DRAW', 'AWAY'].includes(prediction)) {
    return res.status(400).json({ error: '경기와 예측을 확인하세요.' })
  }
  if (!Number.isSafeInteger(stake) || stake <= 0 || stake % 100 !== 0 || stake > 1_000_000_000) {
    return res.status(400).json({ error: '베팅 포인트는 100P 단위로 입력하세요.' })
  }

  const response = await transaction(async (client) => {
    const matchResult = await client.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [matchId])
    if (!matchResult.rowCount) throw Object.assign(new Error('경기를 찾을 수 없습니다.'), { status: 404 })
    const match = matchResult.rows[0]
    if (new Date(match.utc_date) <= new Date() || ['FINISHED', 'CANCELLED'].includes(match.status)) {
      throw Object.assign(new Error('베팅이 마감된 경기입니다.'), { status: 409 })
    }

    const userResult = await client.query('SELECT id, balance, active FROM users WHERE id = $1 FOR UPDATE', [req.user.id])
    if (!userResult.rows[0]?.active) {
      throw Object.assign(new Error('비활성화된 계정입니다.'), { status: 409 })
    }
    const existingResult = await client.query(
      'SELECT * FROM bets WHERE user_id = $1 AND match_id = $2 FOR UPDATE',
      [req.user.id, matchId],
    )
    const existing = existingResult.rows[0]
    const oldStake = existing && existing.status !== 'CANCELLED' ? Number(existing.stake) : 0
    const balance = Number(userResult.rows[0].balance)
    if (balance + oldStake < stake) {
      throw Object.assign(new Error('보유 포인트가 부족합니다.'), { status: 409 })
    }

    const delta = oldStake - stake
    await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [delta, req.user.id])
    const betResult = await client.query(
      `INSERT INTO bets (user_id, match_id, prediction, stake)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, match_id) DO UPDATE SET
         prediction = EXCLUDED.prediction,
         stake = EXCLUDED.stake,
         status = 'PENDING',
         payout = 0,
         updated_at = NOW()
       RETURNING *`,
      [req.user.id, matchId, prediction, stake],
    )
    if (delta !== 0) {
      await client.query(
        `INSERT INTO point_transactions (user_id, amount, kind, ref_type, ref_id, note)
         VALUES ($1, $2, $3, 'match', $4, $5)`,
        [req.user.id, delta, oldStake ? 'BET_CHANGE' : 'BET_PLACED', String(matchId), oldStake ? '베팅 변경' : '베팅 등록'],
      )
    }
    return { bet: betResult.rows[0], balance: balance + delta }
  })
  res.json(response)
})

app.delete('/api/bets/:matchId', requireAuth, async (req, res) => {
  const matchId = Number(req.params.matchId)
  const response = await transaction(async (client) => {
    const matchResult = await client.query('SELECT utc_date, status FROM matches WHERE id = $1 FOR UPDATE', [matchId])
    if (!matchResult.rowCount) throw Object.assign(new Error('경기를 찾을 수 없습니다.'), { status: 404 })
    if (new Date(matchResult.rows[0].utc_date) <= new Date()) {
      throw Object.assign(new Error('베팅이 마감된 경기입니다.'), { status: 409 })
    }
    const betResult = await client.query(
      `SELECT * FROM bets
       WHERE user_id = $1 AND match_id = $2 AND status = 'PENDING'
       FOR UPDATE`,
      [req.user.id, matchId],
    )
    if (!betResult.rowCount) throw Object.assign(new Error('취소할 베팅이 없습니다.'), { status: 404 })
    const stake = Number(betResult.rows[0].stake)
    await client.query('UPDATE bets SET status = \'CANCELLED\', updated_at = NOW() WHERE id = $1', [betResult.rows[0].id])
    const userResult = await client.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance',
      [stake, req.user.id],
    )
    await client.query(
      `INSERT INTO point_transactions (user_id, amount, kind, ref_type, ref_id, note)
       VALUES ($1, $2, 'BET_CANCELLED', 'match', $3, '베팅 취소')`,
      [req.user.id, stake, String(matchId)],
    )
    return { balance: Number(userResult.rows[0].balance) }
  })
  res.json(response)
})

app.get('/api/bets', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT b.*, m.utc_date, m.home_team_name, m.home_team_crest,
            m.away_team_name, m.away_team_crest, m.home_score, m.away_score, m.winner
     FROM bets b JOIN matches m ON m.id = b.match_id
     WHERE b.user_id = $1 AND b.status <> 'CANCELLED'
     ORDER BY m.utc_date DESC`,
    [req.user.id],
  )
  res.json({ bets: result.rows })
})

app.get('/api/leaderboard', requireAuth, async (_req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.nickname, u.balance,
       COUNT(b.id) FILTER (WHERE b.status IN ('WON', 'LOST'))::int AS settled_bets,
       COUNT(b.id) FILTER (WHERE b.status = 'WON')::int AS wins
     FROM users u LEFT JOIN bets b ON b.user_id = u.id
     WHERE u.active = TRUE
     GROUP BY u.id
     ORDER BY u.balance DESC, wins DESC, u.username
     LIMIT 100`,
  )
  res.json({ users: result.rows })
})

app.get('/api/admin/users', requireAdmin, async (_req, res) => {
  const result = await pool.query(
    `SELECT id, username, nickname, role, active, balance, created_at
     FROM users ORDER BY created_at DESC`,
  )
  res.json({ users: result.rows })
})

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const { username, password, role = 'MEMBER' } = req.body || {}
  if (!validUsername(username) || !validPassword(password) || !['ADMIN', 'MEMBER'].includes(role)) {
    return res.status(400).json({ error: '아이디, 8~20자 비밀번호와 역할을 확인하세요.' })
  }
  const passwordHash = await bcrypt.hash(password, 12)
  try {
    const user = await transaction((client) => createUser(client, { username, passwordHash, role }))
    res.status(201).json({ user: cleanUser(user) })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: '이미 존재하는 아이디입니다.' })
    throw error
  }
})

app.patch('/api/admin/users/:userId', requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId)
  if (userId === Number(req.user.id) && req.body?.active === false) {
    return res.status(409).json({ error: '현재 로그인한 관리자 계정은 비활성화할 수 없습니다.' })
  }
  if (typeof req.body?.active !== 'boolean') return res.status(400).json({ error: '활성 상태를 확인하세요.' })
  const user = await transaction((client) => setUserActive(client, userId, req.body.active))
  res.json({ user: cleanUser(user) })
})

app.post('/api/admin/users/:userId/points', requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId)
  const amount = Number(req.body?.amount)
  const note = String(req.body?.note || '관리자 포인트 조정').slice(0, 200)
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000_000) {
    return res.status(400).json({ error: '0이 아닌 정수 포인트를 입력하세요.' })
  }
  const user = await transaction(async (client) => {
    const result = await client.query(
      `UPDATE users SET balance = balance + $1 WHERE id = $2
       RETURNING id, username, nickname, role, active, balance, created_at`,
      [amount, userId],
    )
    if (!result.rowCount) throw Object.assign(new Error('사용자를 찾을 수 없습니다.'), { status: 404 })
    await client.query(
      `INSERT INTO point_transactions (user_id, amount, kind, ref_type, ref_id, note)
       VALUES ($1, $2, 'ADMIN_ADJUSTMENT', 'user', $3, $4)`,
      [userId, amount, String(userId), note],
    )
    return result.rows[0]
  })
  res.json({ user: cleanUser(user) })
})

app.post('/api/admin/users/:userId/password', requireAdmin, async (req, res) => {
  const password = req.body?.password
  if (!validPassword(password)) return res.status(400).json({ error: '비밀번호는 8~20자여야 합니다.' })
  const passwordHash = await bcrypt.hash(password, 12)
  const result = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.params.userId])
  if (!result.rowCount) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [req.params.userId])
  res.status(204).end()
})

app.post('/api/admin/sync', requireAdmin, async (_req, res) => {
  res.json(await syncMatches())
})

app.post('/api/admin/matches/:matchId/settle', requireAdmin, async (req, res) => {
  const matchId = Number(req.params.matchId)
  const homeScore = Number(req.body?.homeScore)
  const awayScore = Number(req.body?.awayScore)
  if (![matchId, homeScore, awayScore].every(Number.isSafeInteger) || homeScore < 0 || awayScore < 0) {
    return res.status(400).json({ error: '유효한 경기와 최종 점수를 입력하세요.' })
  }
  const result = await transaction(async (client) => {
    await reverseSettlement(client, matchId)
    const winner = homeScore === awayScore ? 'DRAW' : homeScore > awayScore ? 'HOME' : 'AWAY'
    const updated = await client.query(
      `UPDATE matches
       SET status = 'FINISHED', home_score = $1, away_score = $2, winner = $3
       WHERE id = $4 RETURNING id`,
      [homeScore, awayScore, winner, matchId],
    )
    if (!updated.rowCount) throw Object.assign(new Error('경기를 찾을 수 없습니다.'), { status: 404 })
    return settleMatch(client, matchId)
  })
  res.json(result)
})

app.use('/api', (_req, res) => res.status(404).json({ error: '요청한 API가 없습니다.' }))

if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h' }))
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(error.status || 500).json({ error: error.status ? error.message : '서버 오류가 발생했습니다.' })
})

async function start() {
  const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8')
  await pool.query(schema)
  const server = app.listen(port, () => console.log(`BET-PL listening on ${port}`))
  process.on('SIGTERM', () => {
    server.close(() => pool.end())
  })
}

start().catch((error) => {
  console.error('Server failed to start:', error.message)
  process.exit(1)
})
