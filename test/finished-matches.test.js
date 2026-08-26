import test from "node:test";
import assert from "node:assert/strict";
import {
  isFinishedMatchInMonth,
  monthDate,
  monthValue,
} from "../src/finishedMatches.js";

test("종료 경기 월 선택은 2026년부터 허용한다", () => {
  assert.equal(
    isFinishedMatchInMonth(
      { status: "FINISHED", utc_date: "2025-12-31T14:59:59Z" },
      "2025-12",
    ),
    false,
  );
  assert.equal(
    isFinishedMatchInMonth(
      { status: "FINISHED", utc_date: "2025-12-31T15:00:00Z" },
      "2026-01",
    ),
    true,
  );
  assert.equal(monthValue(monthDate("2026-08")), "2026-08");
});
