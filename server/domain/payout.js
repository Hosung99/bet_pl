import { calculateOdds } from '../../src/odds.js'

export function calculatePayouts(bets, result, carryover = 0) {
  const pool = bets.reduce((sum, bet) => sum + Number(bet.stake), 0)
  const distributable = pool + Number(carryover)
  const winners = bets.filter((bet) => bet.prediction === result)
  const winningStake = winners.reduce((sum, bet) => sum + Number(bet.stake), 0)

  if (!winningStake) {
    return { pool, distributable, payouts: new Map(), carryoverOut: distributable }
  }

  const payouts = new Map()
  const oddsHundredths = Math.round(calculateOdds(winners.length, bets.length) * 100)
  const carryoverShares = winners.map((bet) =>
    Math.floor((Number(carryover) * Number(bet.stake)) / winningStake))
  let remainder = Number(carryover) - carryoverShares.reduce((sum, share) => sum + share, 0)
  for (let index = 0; remainder > 0; index += 1, remainder -= 1) carryoverShares[index] += 1

  for (const [index, bet] of winners.entries()) {
    const stake = Number(bet.stake)
    const payout = Math.floor((stake * oddsHundredths) / 100) + carryoverShares[index]
    payouts.set(String(bet.id), payout)
  }

  return { pool, distributable, payouts, carryoverOut: 0 }
}
