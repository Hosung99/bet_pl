import test from 'node:test'
import assert from 'node:assert/strict'
import { requireAdmin, requireAuth, validPassword, validUsername } from '../server/auth.js'

test('회원가입 아이디는 최대 100자, 비밀번호는 8~20자까지 허용한다', () => {
  assert.equal(validUsername('a'), false)
  assert.equal(validUsername('a'.repeat(100)), true)
  assert.equal(validUsername('a'.repeat(101)), false)
  assert.equal(validPassword('a'.repeat(7)), false)
  assert.equal(validPassword('a'.repeat(8)), true)
  assert.equal(validPassword('a'.repeat(20)), true)
  assert.equal(validPassword('a'.repeat(21)), false)
})

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
