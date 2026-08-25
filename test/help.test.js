import test from 'node:test'
import assert from 'node:assert/strict'
import { helpAutoOpenKey, helpDismissKey, helpDismissMarker } from '../src/help.js'

test('도움말 하루 숨김 표시는 같은 로컬 날짜에만 유지된다', () => {
  const marker = helpDismissMarker(new Date(2026, 7, 25, 0, 1))
  assert.equal(marker, helpDismissMarker(new Date(2026, 7, 25, 23, 59)))
  assert.notEqual(marker, helpDismissMarker(new Date(2026, 7, 26, 0, 0)))
})

test('도움말 자동 열림 기록은 사용자와 날짜별로 분리된다', () => {
  const today = new Date(2026, 7, 25, 12)
  assert.equal(helpAutoOpenKey(1, today), helpAutoOpenKey(1, new Date(2026, 7, 25, 23)))
  assert.notEqual(helpAutoOpenKey(1, today), helpAutoOpenKey(2, today))
  assert.notEqual(helpAutoOpenKey(1, today), helpAutoOpenKey(1, new Date(2026, 7, 26)))
})

test('오늘 숨김 저장소 키는 인증 사용자별로 분리된다', () => {
  const today = new Date(2026, 7, 25, 12)
  const tomorrow = new Date(2026, 7, 26, 12)
  const storage = new Map([[helpDismissKey(1), helpDismissMarker(today)]])

  assert.equal(storage.get(helpDismissKey(1)), helpDismissMarker(today))
  assert.notEqual(storage.get(helpDismissKey(2)), helpDismissMarker(today))
  assert.notEqual(storage.get(helpDismissKey(1)), helpDismissMarker(tomorrow))
})
