import test from 'node:test'
import assert from 'node:assert/strict'
import { correctMatchSettlement, reverseSettlement, settleMatch } from '../server/settlement.js'

test('정산 알림을 만들고 역정산하면 제거한다', async () => {
  const settledQueries = []
  const settleClient = {
    async query(sql, params = []) {
      settledQueries.push([sql, params])
      if (sql.startsWith('SELECT * FROM matches')) return { rowCount: 1, rows: [{ id: 10, status: 'FINISHED', winner: 'HOME', carryover: 0, utc_date: new Date() }] }
      if (sql.includes('FROM bets WHERE match_id')) return { rowCount: 1, rows: [{ id: 20, user_id: 30, prediction: 'HOME', stake: 100 }] }
      return { rowCount: 1, rows: [] }
    },
  }

  await settleMatch(settleClient, 10)
  const notificationInsert = settledQueries.find(([sql]) => sql.includes('INSERT INTO notifications'))
  assert.doesNotMatch(notificationInsert[0], /user_id/)
  assert.deepEqual(
    notificationInsert[1],
    [20, 'WON'],
  )

  const reversedQueries = []
  const reverseClient = {
    async query(sql, params = []) {
      reversedQueries.push([sql, params])
      if (sql.startsWith('SELECT * FROM settlements')) return { rowCount: 1, rows: [{ match_id: 10, carryover_out: 0, carryover_target_match_id: null }] }
      if (sql.includes('SELECT id, user_id, payout FROM bets')) return { rowCount: 0, rows: [] }
      return { rowCount: 1, rows: [] }
    },
  }

  assert.equal(await reverseSettlement(reverseClient, 10), true)
  assert.deepEqual(
    reversedQueries.find(([sql]) => sql.startsWith('DELETE FROM notifications'))?.[1],
    [10],
  )
})

test('관리자 재정산은 경기 행을 먼저 잠근 뒤 역정산하고 점수를 변경한다', async () => {
  const calls = []
  const client = {
    async query(sql) {
      calls.push(sql)
      if (sql.startsWith('SELECT id, settled_at')) return { rowCount: 1, rows: [{ id: 10, settled_at: null }] }
      if (sql.startsWith('SELECT * FROM settlements')) return { rowCount: 0, rows: [] }
      if (sql.startsWith('SELECT * FROM matches')) return { rowCount: 1, rows: [{ id: 10, status: 'FINISHED', winner: 'HOME', carryover: 0, utc_date: new Date() }] }
      if (sql.includes('FROM bets WHERE match_id')) return { rowCount: 0, rows: [] }
      return { rowCount: 1, rows: [] }
    },
  }

  await correctMatchSettlement(client, 10, 2, 1)
  assert.match(calls[0], /matches WHERE id = \$1 FOR UPDATE/)
  assert.match(calls[1], /settlements WHERE match_id/)
  assert.match(calls[2], /UPDATE matches/)
})

test('같은 점수로 이미 정산된 경기는 잠금 확인만 하고 다시 정산하지 않는다', async () => {
  const calls = []
  const client = {
    async query(sql) {
      calls.push(sql)
      return { rowCount: 1, rows: [{ id: 10, settled_at: new Date(), home_score: 2, away_score: 1 }] }
    },
  }

  assert.deepEqual(await correctMatchSettlement(client, 10, 2, 1), { alreadySettled: true })
  assert.equal(calls.length, 1)
  assert.match(calls[0], /FOR UPDATE/)
})
