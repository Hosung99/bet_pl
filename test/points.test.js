import test from 'node:test'
import assert from 'node:assert/strict'
import { seoulWeekStart } from '../server/domain/points.js'

test('서울 시간 월요일 0시를 주간 지급 기준으로 사용한다', () => {
  assert.equal(seoulWeekStart(new Date('2026-08-23T14:59:59Z')), '2026-08-17')
  assert.equal(seoulWeekStart(new Date('2026-08-23T15:00:00Z')), '2026-08-24')
  assert.equal(seoulWeekStart(new Date('2026-08-29T14:00:00Z')), '2026-08-24')
})
