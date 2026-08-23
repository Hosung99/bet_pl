import test from 'node:test'
import assert from 'node:assert/strict'
import { calculatePayouts } from '../server/domain/payout.js'

test('당첨자에게 베팅액 비율대로 전체 풀을 지급한다', () => {
  const result = calculatePayouts([
    { id: 1, prediction: 'HOME', stake: 100 },
    { id: 2, prediction: 'HOME', stake: 300 },
    { id: 3, prediction: 'AWAY', stake: 600 },
  ], 'HOME', 200)

  assert.equal(result.pool, 1_000)
  assert.equal(result.payouts.get('1'), 300)
  assert.equal(result.payouts.get('2'), 900)
  assert.equal(result.carryoverOut, 0)
})

test('나눗셈 나머지는 다음 경기 이월액으로 남긴다', () => {
  const result = calculatePayouts([
    { id: 1, prediction: 'DRAW', stake: 1 },
    { id: 2, prediction: 'DRAW', stake: 1 },
    { id: 3, prediction: 'HOME', stake: 1 },
  ], 'DRAW')

  assert.deepEqual([...result.payouts.values()], [1, 1])
  assert.equal(result.carryoverOut, 1)
})

test('적중자가 없으면 풀과 기존 잭팟을 모두 이월한다', () => {
  const result = calculatePayouts([
    { id: 1, prediction: 'HOME', stake: 250 },
    { id: 2, prediction: 'AWAY', stake: 250 },
  ], 'DRAW', 100)

  assert.equal(result.payouts.size, 0)
  assert.equal(result.carryoverOut, 600)
})

test('베팅이 없어도 기존 잭팟은 사라지지 않는다', () => {
  const result = calculatePayouts([], 'HOME', 750)
  assert.equal(result.carryoverOut, 750)
})
