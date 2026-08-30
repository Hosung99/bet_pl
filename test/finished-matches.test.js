import test from "node:test";
import assert from "node:assert/strict";
import {
  FINISHED_SCHEDULE_RETENTION_MS,
  isFinishedMatchInMonth,
  isMatchInSchedule,
  isWinningPrediction,
  monthDate,
  monthValue,
  unseenWinningMatchIds,
  winCelebrationKey,
} from "../src/finishedMatches.js";

test("종료 경기 월 선택은 2026년부터 허용한다", () => {
  assert.equal(
    isFinishedMatchInMonth(
      { status: "FINISHED", utc_date: "2025-12-31T14:59:59Z" },
      "2025-12",
      new Date("2026-08-30T00:00:00Z"),
    ),
    false,
  );
  assert.equal(
    isFinishedMatchInMonth(
      { status: "FINISHED", utc_date: "2025-12-31T15:00:00Z" },
      "2026-01",
      new Date("2026-08-30T00:00:00Z"),
    ),
    true,
  );
  assert.equal(monthValue(monthDate("2026-08")), "2026-08");
});

test("종료 경기는 72시간 동안 일정에 남고 이후 종료 목록으로 이동한다", () => {
  const match = {
    status: "FINISHED",
    utc_date: "2026-08-27T12:00:00Z",
    settled_at: "2026-08-27T14:00:00Z",
  };
  const justBeforeArchive = new Date(
    new Date(match.settled_at).getTime() + FINISHED_SCHEDULE_RETENTION_MS - 1,
  );
  const archiveTime = new Date(
    new Date(match.settled_at).getTime() + FINISHED_SCHEDULE_RETENTION_MS,
  );

  assert.equal(isMatchInSchedule(match, justBeforeArchive), true);
  assert.equal(isFinishedMatchInMonth(match, "2026-08", justBeforeArchive), false);
  assert.equal(isMatchInSchedule(match, archiveTime), false);
  assert.equal(isFinishedMatchInMonth(match, "2026-08", archiveTime), true);
  assert.equal(
    isMatchInSchedule(
      { status: "SCHEDULED", utc_date: "2026-01-01T00:00:00Z" },
      archiveTime,
    ),
    true,
  );
});

test("정답과 축하 기록은 종료 결과, 사용자, 경기 ID로 구분한다", () => {
  const finished = { status: "FINISHED", winner: "HOME" };
  assert.equal(isWinningPrediction(finished, "HOME"), true);
  assert.equal(isWinningPrediction(finished, "AWAY"), false);
  assert.equal(
    isWinningPrediction({ status: "SCHEDULED", winner: "HOME" }, "HOME"),
    false,
  );

  const matches = [
    { id: 10, my_bet_status: "WON" },
    { id: 11, my_bet_status: "LOST" },
    { id: 12, my_bet_status: "WON" },
  ];
  assert.deepEqual(unseenWinningMatchIds(matches, ["10"]), ["12"]);
  assert.notEqual(winCelebrationKey(1), winCelebrationKey(2));
});
