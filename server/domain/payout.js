export function calculatePayouts(bets, result, carryover = 0) {
  const pool = bets.reduce((sum, bet) => sum + Number(bet.stake), 0)
  const distributable = pool + Number(carryover)
  const winners = bets.filter((bet) => bet.prediction === result)
  const winningStake = winners.reduce((sum, bet) => sum + Number(bet.stake), 0)

  if (!winningStake) {
    return { pool, distributable, payouts: new Map(), carryoverOut: distributable }
  }

  const payouts = new Map()
  let paid = 0
  for (const bet of winners) {
    const payout = Math.floor((distributable * Number(bet.stake)) / winningStake)
    payouts.set(String(bet.id), payout)
    paid += payout
  }

  return { pool, distributable, payouts, carryoverOut: distributable - paid }
}
