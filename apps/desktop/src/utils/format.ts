/**
 * Renders a stored ISO timestamp in the viewer's locale, e.g.
 * `Tue, Jul 28, 2026, 03:44 AM`. Raw ISO strings are storage format, never
 * something a person should have to read in the UI.
 */
export function formatShortDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Builds `DataTable` cell renderers that format the named ISO timestamp
 * columns, e.g. `renderers={timestampRenderers("updated")}`.
 */
export function timestampRenderers(...columns: string[]): Record<string, (row: any) => string> {
  return Object.fromEntries(
    columns.map((column) => [column, (row: any) => formatShortDateTime(String(row[column] ?? ""))])
  );
}

export function splitList(input: string): string[] {
  return input.split(",").map((item) => item.trim()).filter(Boolean);
}

/** Parses a positive number from form input text; returns undefined otherwise. */
export function numberOrUndefined(input: string): number | undefined {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Formats a 0..1 confidence value as a whole percent, e.g. `0.85` -> `85%`. */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/** Simple 32-bit string hash (Java-style). Not for security or persistence. */
export function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return hash;
}

/**
 * Turns a slug such as `diagram-group` or `code_area` into `Diagram Group`.
 * Pass an acronym map (lowercase part -> replacement) to keep terms like
 * `AI` or `API` fully capitalized.
 */
export function titleCaseSlug(value: string, acronyms: Record<string, string> = {}): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => acronyms[part.toLowerCase()] || part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
