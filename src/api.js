export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })

  if (response.status === 204) return null
  const payload = await response.json().catch(() => ({}))
  if (response.status === 401 && path !== '/api/auth/login') {
    window.dispatchEvent(new Event('matchpot:session-expired'))
  }
  if (!response.ok) throw new Error(payload.error || '요청을 처리하지 못했습니다.')
  return payload
}
