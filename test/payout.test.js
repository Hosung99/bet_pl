import test from 'node:test'
import assert from 'node:assert/strict'
import { calculatePayouts } from '../server/domain/payout.js'

test('정산은 화면과 같은 최종 배당률을 베팅금액에 적용한다', () => {
  const result = calculatePayouts([
    { id: 1, prediction: 'HOME', stake: 100 },
    { id: 2, prediction: 'DRAW', stake: 100 },
    { id: 3, prediction: 'AWAY', stake: 100 },
  ], 'HOME')

  assert.equal(result.payouts.get('1'), 220)
  assert.equal(result.carryoverOut, 0)
})

test('잭팟은 배당금에 적중 베팅 비율로 추가 지급한다', () => {
  const result = calculatePayouts([
    { id: 1, prediction: 'HOME', stake: 100 },
    { id: 2, prediction: 'HOME', stake: 300 },
    { id: 3, prediction: 'AWAY', stake: 600 },
  ], 'HOME', 200)

  assert.equal(result.payouts.get('1'), 203)
  assert.equal(result.payouts.get('2'), 609)
  assert.equal(result.carryoverOut, 0)
})

test('적중자가 있으면 잭팟 나머지도 모두 지급하고 이월하지 않는다', () => {
  const result = calculatePayouts([
    { id: 1, prediction: 'DRAW', stake: 100 },
    { id: 2, prediction: 'DRAW', stake: 100 },
    { id: 3, prediction: 'HOME', stake: 100 },
  ], 'DRAW', 1)

  assert.equal([...result.payouts.values()].reduce((sum, payout) => sum + payout, 0), 307)
  assert.equal(result.carryoverOut, 0)
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
