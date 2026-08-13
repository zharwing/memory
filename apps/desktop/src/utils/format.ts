/** Single presentation-format owner for the English/LTR frontend profile. */
export const DISPLAY_LOCALE = "en";
export const DISPLAY_DIRECTION = "ltr";
export const INVALID_DATE_LABEL = "Invalid date";
export const RELATIVE_CLOCK_QUANTUM_MS = 60_000;

const formatters = {
  shortDateTime: new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }),
  number: new Intl.NumberFormat(DISPLAY_LOCALE),
  percent: new Intl.NumberFormat(DISPLAY_LOCALE, {
    style: "percent",
    maximumFractionDigits: 0
  }),
  relative: new Intl.RelativeTimeFormat(DISPLAY_LOCALE, { numeric: "auto" })
} as const;

export function formatShortDateTime(value: string | number | Date): string {
  const date = value instanceof Date ? value : typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? INVALID_DATE_LABEL : formatters.shortDateTime.format(date);
}

export function formatNumber(value: number): string {
  return Number.isFinite(value) ? formatters.number.format(value) : "—";
}

export function formatRelativeDateTime(value: string | number | Date, now = quantizedClock()): string {
  const date = value instanceof Date ? value : typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return INVALID_DATE_LABEL;
  const deltaSeconds = Math.round((date.getTime() - now) / 1_000);
  if (Math.abs(deltaSeconds) < 60) return formatters.relative.format(deltaSeconds, "second");
  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (Math.abs(deltaMinutes) < 60) return formatters.relative.format(deltaMinutes, "minute");
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) return formatters.relative.format(deltaHours, "hour");
  return formatters.relative.format(Math.round(deltaHours / 24), "day");
}

/** Shared quantized clock identity for relative labels and resume/focus refresh. */
export function quantizedClock(now = Date.now()): number {
  return Math.floor(now / RELATIVE_CLOCK_QUANTUM_MS) * RELATIVE_CLOCK_QUANTUM_MS;
}

export function timestampRenderers<Column extends string>(
  ...columns: readonly Column[]
): Record<Column, (row: Record<Column, unknown>) => string> {
  return Object.fromEntries(
    columns.map((column) => [
      column,
      (row: Record<Column, unknown>) => formatShortDateTime(String(row[column] ?? ""))
    ])
  ) as Record<Column, (row: Record<Column, unknown>) => string>;
}

export function splitList(input: string): string[] {
  return input.split(",").map((item) => item.trim()).filter(Boolean);
}

export function numberOrUndefined(input: string): number | undefined {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function formatConfidence(confidence: number): string {
  return Number.isFinite(confidence) ? formatters.percent.format(Math.min(1, Math.max(0, confidence))) : "—";
}

/** Simple 32-bit string hash (Java-style). Not for security or persistence. */
export function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return hash;
}

export function titleCaseSlug(value: string, acronyms: Record<string, string> = {}): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => acronyms[part.toLowerCase()] || part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
