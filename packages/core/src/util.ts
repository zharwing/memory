export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/**
 * Order-preserving de-duplication that also drops falsy entries, matching the
 * historical `unique`/`uniqueStrings`/`mergeUnique` helpers this replaces.
 */
export function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * De-duplicates by `id`, last occurrence wins (Map insertion overwrite),
 * matching the historical `dedupeEdges` semantics.
 */
export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

/** Clamps to [0, 1]; NaN maps to 0. */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function stringValue(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

export function numberValue(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim() && Number.isFinite(Number(input))) return Number(input);
  return undefined;
}
