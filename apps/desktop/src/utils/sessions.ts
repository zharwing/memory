/** Local calendar day (`YYYY-MM-DD`) for a timestamp, or `""` when unparseable. */
function localDayKey(value: string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A session still marked active from an earlier day: an agent exited without
 * closing it. Mirrors the daemon's day-rollover rule so the UI flags exactly
 * the sessions `memory.close_stale_sessions` would close.
 */
export function isStaleActiveSession(session: { status?: string; updated?: string; started?: string }): boolean {
  if (session.status !== "active") return false;
  const day = localDayKey(session.updated || session.started || "");
  return Boolean(day) && day < localDayKey();
}
