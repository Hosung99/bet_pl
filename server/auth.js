import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { transaction } from './db.js'
import { grantWeeklyPoints } from './domain/points.js'

const SESSION_DAYS = 7

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key]) => key),
  )
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function sessionCookie(token, clear = false) {
  const parts = [
    `session=${clear ? '' : encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    clear ? 'Max-Age=0' : `Max-Age=${SESSION_DAYS * 86_400}`,
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export async function startSession(client, userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  await client.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
    [hashToken(token), userId],
  )
  return token
}

export async function authenticate(req, _res, next) {
  try {
    const token = parseCookies(req.headers.cookie).session
    if (!token) return next()

    req.user = await transaction(async (client) => {
      const result = await client.query(
        `SELECT u.id, u.username, u.nickname, u.role, u.active, u.balance
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE`,
        [hashToken(token)],
      )
      if (!result.rowCount) return null
      await grantWeeklyPoints(client, result.rows[0].id)
      const refreshed = await client.query(
        'SELECT id, username, nickname, role, active, balance FROM users WHERE id = $1',
        [result.rows[0].id],
      )
      return refreshed.rows[0]
    })
    req.sessionTokenHash = hashToken(token)
    next()
  } catch (error) {
    next(error)
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '로그인이 필요합니다.' })
  next()
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '로그인이 필요합니다.' })
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: '관리자 권한이 필요합니다.' })
  next()
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}
