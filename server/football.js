import { pool, transaction } from './db.js'
import { attachUnassignedCarryover, settleMatch } from './settlement.js'

const API_URL = 'https://api.football-data.org/v4/competitions/PL/matches'
const STANDINGS_API_URL = 'https://api.football-data.org/v4/competitions/PL/standings'
const FRESH_FOR_MS = 30 * 60 * 1_000
let syncInFlight
let standingsCache
let standingsInFlight

function winnerFrom(match) {
  if (match.score?.winner === 'HOME_TEAM') return 'HOME'
  if (match.score?.winner === 'AWAY_TEAM') return 'AWAY'
  if (match.score?.winner === 'DRAW') return 'DRAW'
  return null
}

export function normalizeStandings(payload) {
  const total = payload.standings?.find((standing) => standing.type === 'TOTAL')
  return {
    currentMatchday: Number(payload.season?.currentMatchday) || null,
    table: (total?.table || []).map((row) => ({
      position: Number(row.position),
      team: {
        id: row.team?.id,
        name: row.team?.name,
        shortName: row.team?.shortName,
        tla: row.team?.tla,
        crest: row.team?.crest,
      },
      playedGames: Number(row.playedGames),
      won: Number(row.won),
      draw: Number(row.draw),
      lost: Number(row.lost),
      goalsFor: Number(row.goalsFor),
      goalsAgainst: Number(row.goalsAgainst),
      goalDifference: Number(row.goalDifference),
      points: Number(row.points),
    })),
  }
}

export async function getStandings() {
  if (standingsCache && Date.now() - standingsCache.fetchedAt < FRESH_FOR_MS) {
    return standingsCache.data
  }
  if (!process.env.FOOTBALL_DATA_TOKEN) {
    throw Object.assign(new Error('FOOTBALL_DATA_TOKEN이 설정되지 않았습니다.'), { status: 503 })
  }
  if (!standingsInFlight) {
    standingsInFlight = fetch(STANDINGS_API_URL, {
      headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN },
      signal: AbortSignal.timeout(15_000),
    }).then(async (response) => {
      if (!response.ok) {
        throw Object.assign(new Error(`순위 데이터 조회 실패 (${response.status})`), { status: 502 })
      }
      const data = normalizeStandings(await response.json())
      standingsCache = { data, fetchedAt: Date.now() }
      return data
    }).finally(() => {
      standingsInFlight = null
    })
  }
  return standingsInFlight
}

export async function syncMatches() {
  if (!process.env.FOOTBALL_DATA_TOKEN) {
    throw Object.assign(new Error('FOOTBALL_DATA_TOKEN이 설정되지 않았습니다.'), { status: 503 })
  }

  const response = await fetch(API_URL, {
    headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw Object.assign(new Error(`축구 데이터 동기화 실패 (${response.status})`), { status: 502 })
  }
  const payload = await response.json()

  await transaction(async (client) => {
    for (const match of payload.matches || []) {
      await client.query(
        `INSERT INTO matches (
           id, matchday, utc_date, status,
           home_team_id, home_team_name, home_team_crest,
           away_team_id, away_team_name, away_team_crest,
           home_score, away_score, winner, last_synced_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
         ON CONFLICT (id) DO UPDATE SET
           matchday = EXCLUDED.matchday,
           utc_date = EXCLUDED.utc_date,
           status = CASE WHEN matches.settled_at IS NULL THEN EXCLUDED.status ELSE matches.status END,
           home_team_id = EXCLUDED.home_team_id,
           home_team_name = EXCLUDED.home_team_name,
           home_team_crest = EXCLUDED.home_team_crest,
           away_team_id = EXCLUDED.away_team_id,
           away_team_name = EXCLUDED.away_team_name,
           away_team_crest = EXCLUDED.away_team_crest,
           home_score = CASE WHEN matches.settled_at IS NULL THEN EXCLUDED.home_score ELSE matches.home_score END,
           away_score = CASE WHEN matches.settled_at IS NULL THEN EXCLUDED.away_score ELSE matches.away_score END,
           winner = CASE WHEN matches.settled_at IS NULL THEN EXCLUDED.winner ELSE matches.winner END,
           last_synced_at = NOW()`,
        [
          match.id,
          match.matchday,
          match.utcDate,
          match.status,
          match.homeTeam?.id,
          match.homeTeam?.shortName || match.homeTeam?.name,
          match.homeTeam?.crest,
          match.awayTeam?.id,
          match.awayTeam?.shortName || match.awayTeam?.name,
          match.awayTeam?.crest,
          match.score?.fullTime?.home,
          match.score?.fullTime?.away,
          winnerFrom(match),
        ],
      )
    }
    await attachUnassignedCarryover(client)
    await client.query(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES ('last_match_sync', jsonb_build_object('at', NOW()), NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    )
  })

  const unsettled = await pool.query(
    `SELECT id FROM matches
     WHERE status = 'FINISHED' AND winner IS NOT NULL AND settled_at IS NULL
     ORDER BY utc_date`,
  )
  for (const match of unsettled.rows) {
    await transaction((client) => settleMatch(client, match.id))
  }

  return { synced: payload.matches?.length || 0, settled: unsettled.rowCount }
}

export async function ensureMatchesFresh() {
  if (!process.env.FOOTBALL_DATA_TOKEN) return
  const freshness = await pool.query('SELECT MAX(last_synced_at) AS synced_at FROM matches')
  const syncedAt = freshness.rows[0]?.synced_at
  if (syncedAt && Date.now() - new Date(syncedAt).getTime() < FRESH_FOR_MS) return

  if (!syncInFlight) {
    syncInFlight = syncMatches().finally(() => {
      syncInFlight = null
    })
  }
  return syncInFlight
}
