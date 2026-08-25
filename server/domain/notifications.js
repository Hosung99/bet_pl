const MAX_VISIBLE_NOTIFICATIONS = 50

export async function getNotifications(client, userId) {
  const result = await client.query(
    `SELECT n.id, n.result, n.read_at, n.created_at,
            b.match_id, b.prediction, b.stake, b.payout,
            m.home_team_name, m.away_team_name, m.home_score, m.away_score
     FROM notifications n
     JOIN bets b ON b.id = n.bet_id
     JOIN matches m ON m.id = b.match_id
     WHERE b.user_id = $1
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT ${MAX_VISIBLE_NOTIFICATIONS}`,
    [userId],
  )
  return result.rows
}

export function normalizeNotificationIds(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_VISIBLE_NOTIFICATIONS) {
    throw Object.assign(new Error('읽을 알림을 확인하세요.'), { status: 400 })
  }
  const ids = value.map((id) => {
    if (Number.isSafeInteger(id) && id > 0) return String(id)
    if (typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9_223_372_036_854_775_807n) return id
    throw Object.assign(new Error('읽을 알림을 확인하세요.'), { status: 400 })
  })
  if (new Set(ids).size !== ids.length) {
    throw Object.assign(new Error('읽을 알림을 확인하세요.'), { status: 400 })
  }
  return ids
}

export async function markNotificationsRead(client, userId, ids) {
  const result = await client.query(
    `WITH visible AS (
       SELECT n.id
       FROM notifications n
       JOIN bets b ON b.id = n.bet_id
       WHERE b.user_id = $1
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT ${MAX_VISIBLE_NOTIFICATIONS}
     )
     UPDATE notifications n SET read_at = NOW()
     FROM visible v
     WHERE n.id = v.id
       AND n.id = ANY($2::bigint[])
       AND n.read_at IS NULL`,
    [userId, normalizeNotificationIds(ids)],
  )
  return result.rowCount
}
