import { normalizeSlug } from "./text.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(input: string): string {
  return normalizeSlug(input, { strip: /['"]/g, fallback: "project" });
}

export function createId(prefix: string): string {
  // globalThis.crypto.randomUUID exists in Node 20+ and every modern browser,
  // keeping this module (and the core barrel) browser-safe.
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

export function shortDateSlug(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function shortLocalSessionDate(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}-${day}-${year}`;
}

/**
 * Local calendar day (`YYYY-MM-DD`) for a timestamp, or `""` when unparseable.
 * Session files are already bucketed by local day (see `createSessionFilename`),
 * so day-rollover checks use the same local boundary instead of UTC.
 */
export function localDayKey(value: string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function filenameSafe(input: string): string {
  return slugify(input).slice(0, 80) || "untitled";
}

export function createSessionFilename(args: {
  date?: Date;
  taskTitle?: string;
  suffix?: string;
}): string {
  const date = shortLocalSessionDate(args.date);
  const task = args.taskTitle?.trim() ? `__${filenameSafe(args.taskTitle)}` : "";
  const suffix = args.suffix ? `-${filenameSafe(args.suffix)}` : "";
  return `session-${date}${task}${suffix}.md`;
}

export function defaultSessionTitle(date = new Date()): string {
  return `Session ${shortLocalSessionDate(date)}`;
}
