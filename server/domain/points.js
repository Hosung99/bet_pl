export const WEEKLY_GRANT = 1_000

export function seoulWeekStart(now = new Date()) {
  const offset = 9 * 60 * 60 * 1_000
  const local = new Date(now.getTime() + offset)
  const daysFromMonday = (local.getUTCDay() + 6) % 7
  local.setUTCDate(local.getUTCDate() - daysFromMonday)
  local.setUTCHours(0, 0, 0, 0)
  return local.toISOString().slice(0, 10)
}

export async function grantWeeklyPoints(client, userId, now = new Date()) {
  const weekStart = seoulWeekStart(now)
  const inserted = await client.query(
    `INSERT INTO weekly_grants (user_id, week_start, amount)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING amount`,
    [userId, weekStart, WEEKLY_GRANT],
  )

  if (!inserted.rowCount) return false

  await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [WEEKLY_GRANT, userId])
  await client.query(
    `INSERT INTO point_transactions (user_id, amount, kind, ref_type, ref_id, note)
     VALUES ($1, $2, 'WEEKLY_GRANT', 'week', $3, '주간 포인트 지급')`,
    [userId, WEEKLY_GRANT, weekStart],
  )
  return true
}

export async function createUser(client, { username, passwordHash, role = 'MEMBER' }) {
  const result = await client.query(
    `INSERT INTO users (username, nickname, password_hash, role, balance)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, nickname, role, active, balance, created_at`,
    [username, username.slice(0, 20), passwordHash, role, WEEKLY_GRANT],
  )
  const user = result.rows[0]
  const weekStart = seoulWeekStart()
  await client.query(
    `INSERT INTO weekly_grants (user_id, week_start, amount) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [user.id, weekStart, WEEKLY_GRANT],
  )
  await client.query(
    `INSERT INTO point_transactions (user_id, amount, kind, ref_type, ref_id, note)
     VALUES ($1, $2, 'INITIAL_GRANT', 'user', $3, '신규 계정 포인트')`,
    [user.id, WEEKLY_GRANT, String(user.id)],
  )
  return user
}

export async function setUserActive(client, userId, active) {
  const current = await client.query(
    `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
    [userId],
  )
  if (!current.rowCount) {
    throw Object.assign(new Error('사용자를 찾을 수 없습니다.'), { status: 404 })
  }

  const cancelled = active
    ? { rows: [] }
    : await client.query(
        `UPDATE bets SET status = 'CANCELLED', updated_at = NOW()
         WHERE user_id = $1 AND status = 'PENDING'
         RETURNING match_id, stake`,
        [userId],
      )
  const refund = cancelled.rows.reduce((sum, bet) => sum + Number(bet.stake), 0)
  const updated = await client.query(
    `UPDATE users SET active = $1, balance = balance + $2 WHERE id = $3
     RETURNING id, username, nickname, role, active, balance, created_at`,
    [active, refund, userId],
  )

  for (const bet of cancelled.rows) {
    await client.query(
      `INSERT INTO point_transactions (user_id, amount, kind, ref_type, ref_id, note)
       VALUES ($1, $2, 'BET_CANCELLED', 'match', $3, '계정 비활성화로 베팅 취소')`,
      [userId, Number(bet.stake), String(bet.match_id)],
    )
  }

  return updated.rows[0]
}
