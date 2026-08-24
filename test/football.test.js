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
  })
})
