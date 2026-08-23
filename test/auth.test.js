import test from 'node:test'
import assert from 'node:assert/strict'
import { requireAdmin, requireAuth } from '../server/auth.js'

test('미로그인 요청은 오류 스택 대신 401 응답으로 종료한다', () => {
  for (const guard of [requireAuth, requireAdmin]) {
    let status
    let payload
    const response = {
      status(code) {
        status = code
        return this
      },
      json(body) {
        payload = body
      },
    }

    guard({}, response, () => assert.fail('next를 호출하면 안 됩니다.'))
    assert.equal(status, 401)
    assert.deepEqual(payload, { error: '로그인이 필요합니다.' })
  }
})
