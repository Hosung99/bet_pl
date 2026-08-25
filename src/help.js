const HELP_DISMISS_KEY = 'bet-pl-help-v1'

export function helpDismissKey(userId) {
  return `${HELP_DISMISS_KEY}:${userId}`
}

export function helpDismissMarker(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `v1:${year}-${month}-${day}`
}

export function helpAutoOpenKey(userId, date = new Date()) {
  return `${userId}:${helpDismissMarker(date)}`
}
