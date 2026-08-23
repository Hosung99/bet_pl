import test from 'node:test'
import assert from 'node:assert/strict'
import { createUser, seoulWeekStart } from '../server/domain/points.js'

test('서울 시간 월요일 0시를 주간 지급 기준으로 사용한다', () => {
  assert.equal(seoulWeekStart(new Date('2026-08-23T14:59:59Z')), '2026-08-17')
  assert.equal(seoulWeekStart(new Date('2026-08-23T15:00:00Z')), '2026-08-24')
  assert.equal(seoulWeekStart(new Date('2026-08-29T14:00:00Z')), '2026-08-24')
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
