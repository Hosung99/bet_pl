export const FINISHED_MONTH_MIN = "2026-01";
export const FINISHED_SCHEDULE_RETENTION_MS = 3 * 24 * 60 * 60 * 1_000;

export function seoulMonth(value = new Date()) {
  const date = new Date(value);
  return new Date(date.getTime() + 9 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 7);
}

export function monthDate(value) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export function monthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function isMatchInSchedule(match, now = new Date()) {
  if (match.status !== "FINISHED") return true;
  const age =
    new Date(now).getTime() -
    new Date(match.settled_at || match.utc_date).getTime();
  return Number.isFinite(age) && age < FINISHED_SCHEDULE_RETENTION_MS;
}

export function isFinishedMatchInMonth(
  match,
  selectedMonth,
  now = new Date(),
) {
  const matchMonth = seoulMonth(match.utc_date);
  return (
    match.status === "FINISHED" &&
    !isMatchInSchedule(match, now) &&
    matchMonth >= FINISHED_MONTH_MIN &&
    matchMonth === selectedMonth
  );
}

export function isWinningPrediction(match, prediction) {
  return (
    match.status === "FINISHED" &&
    Boolean(match.winner) &&
    match.winner === prediction
  );
}

export function winCelebrationKey(userId) {
  return `bet-pl-celebrated-wins:${userId}`;
}

export function unseenWinningMatchIds(matches, seenIds = []) {
  const seen = new Set(seenIds.map(String));
  return matches
    .filter(
      (match) =>
        match.id != null &&
        match.my_bet_status === "WON" &&
        !seen.has(String(match.id)),
    )
    .map((match) => String(match.id));
}
