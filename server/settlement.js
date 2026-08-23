import { calculatePayouts } from './domain/payout.js'

async function assignCarryover(client, amount, afterDate) {
  if (amount <= 0) return null

  const target = await client.query(
    `SELECT id FROM matches
     WHERE settled_at IS NULL
       AND utc_date > GREATEST($1::timestamptz, NOW())
     ORDER BY utc_date, id
     FOR UPDATE SKIP LOCKED
     LIMIT 1`,
    [afterDate],
  )

  if (target.rowCount) {
    await client.query('UPDATE matches SET carryover = carryover + $1 WHERE id = $2', [amount, target.rows[0].id])
    return target.rows[0].id
  }

  await client.query(
    `UPDATE app_state
     SET value = jsonb_build_object('amount', COALESCE((value->>'amount')::bigint, 0) + $1::bigint),
         updated_at = NOW()
     WHERE key = 'unassigned_carryover'`,
    [amount],
  )
  return null
}

export async function attachUnassignedCarryover(client) {
  const state = await client.query(
    `SELECT COALESCE((value->>'amount')::bigint, 0) AS amount
     FROM app_state WHERE key = 'unassigned_carryover' FOR UPDATE`,
  )
  const amount = Number(state.rows[0]?.amount || 0)
  if (!amount) return null

  const target = await client.query(
    `SELECT id FROM matches
     WHERE settled_at IS NULL AND utc_date > NOW()
     ORDER BY utc_date, id
     FOR UPDATE SKIP LOCKED LIMIT 1`,
  )
  if (!target.rowCount) return null

  await client.query('UPDATE matches SET carryover = carryover + $1 WHERE id = $2', [amount, target.rows[0].id])
  await client.query(
    `UPDATE settlements SET carryover_target_match_id = $1
     WHERE carryover_target_match_id IS NULL AND carryover_out > 0`,
    [target.rows[0].id],
  )
  await client.query(
    `UPDATE app_state SET value = '{"amount": 0}'::jsonb, updated_at = NOW()
     WHERE key = 'unassigned_carryover'`,
  )
  return target.rows[0].id
}

export async function settleMatch(client, matchId) {
  const matchResult = await client.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [matchId])
  if (!matchResult.rowCount) throw Object.assign(new Error('경기를 찾을 수 없습니다.'), { status: 404 })

  const match = matchResult.rows[0]
  if (match.settled_at) return { alreadySettled: true }
  if (match.status !== 'FINISHED' || !match.winner) {
    throw Object.assign(new Error('종료 결과가 있는 경기만 정산할 수 있습니다.'), { status: 409 })
  }

  const betsResult = await client.query(
    `SELECT id, user_id, prediction, stake
     FROM bets WHERE match_id = $1 AND status <> 'CANCELLED'
     ORDER BY id FOR UPDATE`,
    [matchId],
  )
  const outcome = calculatePayouts(betsResult.rows, match.winner, match.carryover)

  for (const bet of betsResult.rows) {
    const payout = outcome.payouts.get(String(bet.id)) || 0
    const status = bet.prediction === match.winner ? 'WON' : 'LOST'
    await client.query('UPDATE bets SET status = $1, payout = $2, updated_at = NOW() WHERE id = $3', [status, payout, bet.id])
    if (payout > 0) {
      await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [payout, bet.user_id])
      await client.query(
        `INSERT INTO point_transactions (user_id, amount, kind, ref_type, ref_id, note)
         VALUES ($1, $2, 'BET_WIN', 'match', $3, '경기 적중 정산')`,
        [bet.user_id, payout, String(matchId)],
      )
    }
  }

  const carryoverTarget = await assignCarryover(client, outcome.carryoverOut, match.utc_date)
  await client.query(
    `INSERT INTO settlements
       (match_id, result, bet_pool, carryover_in, carryover_out, carryover_target_match_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [matchId, match.winner, outcome.pool, match.carryover, outcome.carryoverOut, carryoverTarget],
  )
  await client.query('UPDATE matches SET settled_at = NOW() WHERE id = $1', [matchId])

  return {
    pool: outcome.pool,
    carryoverIn: Number(match.carryover),
    carryoverOut: outcome.carryoverOut,
    winners: outcome.payouts.size,
  }
}

export async function reverseSettlement(client, matchId) {
  const settlementResult = await client.query('SELECT * FROM settlements WHERE match_id = $1 FOR UPDATE', [matchId])
  if (!settlementResult.rowCount) return false
  const settlement = settlementResult.rows[0]

  if (settlement.carryover_target_match_id) {
    const target = await client.query(
      'SELECT settled_at, carryover FROM matches WHERE id = $1 FOR UPDATE',
      [settlement.carryover_target_match_id],
    )
    if (target.rows[0]?.settled_at) {
      throw Object.assign(new Error('이월 대상 경기가 이미 정산되었습니다. 이후 경기부터 역순으로 재정산하세요.'), { status: 409 })
    }
    if (Number(target.rows[0]?.carryover || 0) < Number(settlement.carryover_out)) {
      throw Object.assign(new Error('이월 포인트 상태가 일치하지 않아 재정산할 수 없습니다.'), { status: 409 })
    }
    await client.query('UPDATE matches SET carryover = carryover - $1 WHERE id = $2', [settlement.carryover_out, settlement.carryover_target_match_id])
  } else if (Number(settlement.carryover_out) > 0) {
    const state = await client.query(
      `SELECT COALESCE((value->>'amount')::bigint, 0) AS amount
       FROM app_state WHERE key = 'unassigned_carryover' FOR UPDATE`,
    )
    if (Number(state.rows[0]?.amount || 0) < Number(settlement.carryover_out)) {
      throw Object.assign(new Error('미배정 이월 포인트 상태가 일치하지 않아 재정산할 수 없습니다.'), { status: 409 })
    }
    await client.query(
      `UPDATE app_state
       SET value = jsonb_build_object('amount', (value->>'amount')::bigint - $1::bigint), updated_at = NOW()
       WHERE key = 'unassigned_carryover'`,
      [settlement.carryover_out],
    )
  }

  const winners = await client.query(
    `SELECT id, user_id, payout FROM bets
     WHERE match_id = $1 AND payout > 0 FOR UPDATE`,
    [matchId],
  )
  for (const bet of winners.rows) {
    await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [bet.payout, bet.user_id])
    await client.query(
      `INSERT INTO point_transactions (user_id, amount, kind, ref_type, ref_id, note)
       VALUES ($1, $2, 'SETTLEMENT_REVERSAL', 'match', $3, '경기 정산 역분개')`,
      [bet.user_id, -Number(bet.payout), String(matchId)],
    )
  }

  await client.query(
    `UPDATE bets SET status = 'PENDING', payout = 0, updated_at = NOW()
     WHERE match_id = $1 AND status <> 'CANCELLED'`,
    [matchId],
  )
  await client.query('DELETE FROM settlements WHERE match_id = $1', [matchId])
  await client.query('UPDATE matches SET settled_at = NULL WHERE id = $1', [matchId])
  return true
}
