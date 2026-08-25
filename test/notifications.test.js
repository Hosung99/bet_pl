import test from 'node:test'
import assert from 'node:assert/strict'
import { getNotifications, markNotificationsRead, normalizeNotificationIds } from '../server/domain/notifications.js'

test('알림 조회는 bets 소유권과 최신 50개 순서를 사용한다', async () => {
  const calls = []
  const client = {
    async query(sql, params) {
      calls.push([sql, params])
      return { rows: [{ id: '11' }] }
    },
  }

  assert.deepEqual(await getNotifications(client, 7), [{ id: '11' }])
  assert.deepEqual(calls[0][1], [7])
  assert.match(calls[0][0], /JOIN bets b ON b\.id = n\.bet_id/)
  assert.match(calls[0][0], /WHERE b\.user_id = \$1/)
  assert.match(calls[0][0], /ORDER BY n\.created_at DESC, n\.id DESC\s+LIMIT 50/)
})

test('읽음 처리는 요청 사용자가 소유한 화면 표시 알림 ID만 전달한다', async () => {
  const calls = []
  const notifications = [{ id: '11', userId: 7 }, { id: '12', userId: 8 }]
  const client = {
    async query(sql, params) {
      calls.push([sql, params])
      const [userId, ids] = params
      return { rowCount: notifications.filter((item) => item.userId === userId && ids.includes(item.id)).length }
    },
  }

  assert.equal(await markNotificationsRead(client, 7, [11, 12]), 1)
  assert.deepEqual(calls[0][1], [7, ['11', '12']])
  assert.match(calls[0][0], /JOIN bets b ON b\.id = n\.bet_id/)
  assert.match(calls[0][0], /WHERE b\.user_id = \$1/)
  assert.match(calls[0][0], /ORDER BY n\.created_at DESC, n\.id DESC\s+LIMIT 50/)
  assert.match(calls[0][0], /n\.id = ANY\(\$2::bigint\[\]\)/)
  assert.match(calls[0][0], /n\.read_at IS NULL/)
})

test('알림 ID는 양의 안전한 정수 50개 이하만 허용한다', () => {
  assert.deepEqual(normalizeNotificationIds([1, '2']), ['1', '2'])
  for (const ids of [[], [0], [1.5], ['01'], ['9223372036854775808'], [1, '1'], Array.from({ length: 51 }, (_, index) => index + 1)]) {
    assert.throws(() => normalizeNotificationIds(ids), { status: 400 })
  }
})
