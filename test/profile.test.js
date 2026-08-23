import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeNickname } from '../server/domain/profile.js'
import { calculateOdds } from '../src/odds.js'

test('닉네임은 공백을 제거하고 2~20자만 허용한다', () => {
  assert.equal(normalizeNickname('  축구왕  '), '축구왕')
  assert.equal(normalizeNickname('한'), null)
  assert.equal(normalizeNickname('가'.repeat(21)), null)
})

test('예상 배당은 1.2부터 선택 인원이 적을수록 높아진다', () => {
  assert.equal(calculateOdds(0, 0), 1.2)
  assert.equal(calculateOdds(3, 3), 1.2)
  assert.equal(calculateOdds(1, 3), 2.2)
  assert.equal(calculateOdds(0, 3), 4.2)
})
