export function normalizeNickname(value) {
  if (typeof value !== 'string') return null
  const nickname = value.trim()
  return nickname.length >= 2 && nickname.length <= 20 ? nickname : null
}
