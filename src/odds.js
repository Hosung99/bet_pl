export function calculateOdds(bettors, totalBettors) {
  const supporters = Math.max(0, Number(bettors) || 0)
  const total = Math.max(supporters, Number(totalBettors) || 0)
  return Number((1.2 + (total - supporters) / (supporters + 1)).toFixed(2))
}
