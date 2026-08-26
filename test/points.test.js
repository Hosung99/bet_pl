import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createUser,
  grantDailyAttendancePoints,
  seoulDate,
  setUserActive,
} from '../server/domain/points.js'

test('서울 시간 자정을 출석 지급 기준으로 사용한다', () => {
  assert.equal(seoulDate(new Date('2026-08-23T14:59:59Z')), '2026-08-23')
  assert.equal(seoulDate(new Date('2026-08-23T15:00:00Z')), '2026-08-24')
})

test('하루 첫 접속에만 출석 포인트 200P를 지급한다', async () => {
  const calls = []
  const client = {
    async query(sql, params) {
      calls.push([sql, params])
      return { rowCount: calls.length === 1 ? 1 : 0, rows: [] }
    },
  }

  assert.equal(await grantDailyAttendancePoints(client, 7, new Date('2026-08-23T15:00:00Z')), true)
  assert.match(calls[0][0], /INSERT INTO weekly_grants/)
  assert.deepEqual(calls.map(([, params]) => params), [
    [7, '2026-08-24', 200],
    [200, 7],
    [7, 200, '2026-08-24'],
  ])

  calls.length = 0
  client.query = async (sql, params) => {
    calls.push([sql, params])
    return { rowCount: 0, rows: [] }
  }
  assert.equal(await grantDailyAttendancePoints(client, 7, new Date('2026-08-24T00:00:00Z')), false)
  assert.equal(calls.length, 1)
})

test('회원가입은 아이디와 기본 닉네임을 별도 SQL 파라미터로 저장한다', async () => {
  const calls = []
  const username = 'abcdefghijklmnopqrstuv'
  const client = {
    async query(sql, params) {
      calls.push([sql, params])
      if (calls.length === 1) {
        return { rows: [{ id: 1, username, nickname: username.slice(0, 20) }] }
      }
      return { rows: [], rowCount: 1 }
    },
  }

  await createUser(client, { username, passwordHash: 'hash' })
  assert.match(calls[0][0], /VALUES \(\$1, \$2, \$3, \$4, \$5\)/)
  assert.deepEqual(calls[0][1], [username, username.slice(0, 20), 'hash', 'MEMBER', 1_000])
})

test('계정 비활성화는 미정산 베팅을 취소하고 베팅금을 돌려준다', async () => {
  const calls = []
  const client = {
    async query(sql, params) {
      calls.push([sql, params])
      if (/SELECT id FROM users/.test(sql)) return { rowCount: 1, rows: [{ id: 7 }] }
      if (/UPDATE bets/.test(sql)) {
        return { rows: [{ match_id: 10, stake: '100' }, { match_id: 11, stake: '300' }] }
      }
      if (/UPDATE users/.test(sql)) {
        return { rows: [{ id: 7, active: false, balance: '900' }] }
      }
      return { rowCount: 1, rows: [] }
    },
  }

  const user = await setUserActive(client, 7, false)

  assert.equal(user.balance, '900')
  assert.match(calls[1][0], /status = 'PENDING'/)
  assert.deepEqual(calls[2][1], [false, 400, 7])
  assert.deepEqual(calls.slice(3).map(([, params]) => params), [
    [7, 100, '10'],
    [7, 300, '11'],
  ])
})
