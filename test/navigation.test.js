import test from 'node:test'
import assert from 'node:assert/strict'
import { TAB_PATHS, tabFromPath } from '../src/navigation.js'

test('navbar 경로는 새로고침 후 같은 탭으로 복원된다', () => {
  for (const [tab, path] of Object.entries(TAB_PATHS)) {
    assert.equal(tabFromPath(path), tab)
    assert.equal(tabFromPath(`${path}/`), tab)
  }
  assert.equal(tabFromPath('/unknown'), 'dashboard')
})
