export const FINISHED_MONTH_MIN = "2026-01";

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

export function isFinishedMatchInMonth(match, selectedMonth) {
  const matchMonth = seoulMonth(match.utc_date);
  return (
    match.status === "FINISHED" &&
    matchMonth >= FINISHED_MONTH_MIN &&
    matchMonth === selectedMonth
  );
}
