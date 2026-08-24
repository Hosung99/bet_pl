export const TAB_PATHS = {
  dashboard: '/',
  standings: '/standings',
  bets: '/my-page',
  leaderboard: '/leaderboard',
  admin: '/admin',
}

export function tabFromPath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/'
  return Object.entries(TAB_PATHS).find(([, route]) => route === path)?.[0] || 'dashboard'
}
