import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStandings } from '../server/football.js'

test('공식 순위 응답에서 전체 리그 테이블을 정규화한다', () => {
  const result = normalizeStandings({
    season: { currentMatchday: 4 },
    standings: [{
      type: 'TOTAL',
      table: [{
        position: 1,
        team: { id: 1, name: 'Test FC', shortName: 'Test', tla: 'TST', crest: 'crest.svg' },
        playedGames: 4,
        won: 3,
        draw: 1,
        lost: 0,
        goalsFor: 8,
        goalsAgainst: 2,
        goalDifference: 6,
        points: 10,
      }],
    }],
  })

  assert.equal(result.currentMatchday, 4)
  assert.deepEqual(result.table[0], {
    position: 1,
    team: { id: 1, name: 'Test FC', shortName: 'Test', tla: 'TST', crest: 'crest.svg' },
    playedGames: 4,
    won: 3,
    draw: 1,
    lost: 0,
    goalsFor: 8,
    goalsAgainst: 2,
    goalDifference: 6,
    points: 10,
    form: [],
  })
})

test('팀별 최근 5경기 결과를 오래된 경기부터 정리한다', () => {
  const payload = {
    standings: [{
      type: 'TOTAL',
      table: [{ position: 1, team: { id: 1 } }],
    }],
  }
  const matches = [
    ['2026-01-01', 1, 2, 'HOME'],
    ['2026-01-02', 2, 1, 'HOME'],
    ['2026-01-03', 1, 2, 'DRAW'],
    ['2026-01-04', 2, 1, 'AWAY'],
    ['2026-01-05', 1, 2, 'AWAY'],
    ['2026-01-06', 2, 1, 'DRAW'],
  ].map(([utc_date, home_team_id, away_team_id, winner]) => ({
    utc_date,
    home_team_id,
    away_team_id,
    winner,
  }))

  assert.deepEqual(normalizeStandings(payload, matches).table[0].form, ['L', 'D', 'W', 'L', 'D'])
})
