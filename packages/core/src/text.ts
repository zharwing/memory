export interface TokenizeOptions {
  /** Minimum term length to keep (inclusive). Defaults to 2. */
  minTermLength?: number;
}

/**
 * Splits free text into lowercase search terms, keeping `_ . / -` inside
 * terms so file paths and identifiers survive tokenization.
 */
export function tokenize(input: string, options: TokenizeOptions = {}): string[] {
  const minTermLength = options.minTermLength ?? 2;
  return input
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((term) => term.length >= minTermLength);
}

export interface TruncateOptions {
  /** Suffix appended when truncation happens. Defaults to "…". */
  ellipsis?: string;
}

/**
 * Truncates to at most `maxChars` characters minus one, appending the
 * ellipsis, matching the historical session-store truncate semantics.
 */
export function truncate(input: string, maxChars: number, options: TruncateOptions = {}): string {
  const ellipsis = options.ellipsis ?? "…";
  return input.length <= maxChars ? input : `${input.slice(0, Math.max(0, maxChars - 1))}${ellipsis}`;
}

export function truncateOptional(
  input: string | undefined,
  maxChars: number,
  options?: TruncateOptions
): string | undefined {
  return input ? truncate(input, maxChars, options) : undefined;
}

export interface NormalizeSlugOptions {
  /** Characters removed outright before collapsing, e.g. /['"]/g. */
  strip?: RegExp;
  /** Characters mapped to "-" before the main collapse, e.g. /[_./\\]+/g. */
  mapToDash?: RegExp;
  /**
   * Character class collapsed to "-". Defaults to /[^a-z0-9]+/g; pass a wider
   * keep-set (e.g. /[^a-z0-9._/-]+/g) to preserve extra characters.
   */
  collapse?: RegExp;
  /** Fallback returned when the result would be empty. */
  fallback?: string;
}

/**
 * Single slug/normalization engine behind `slugify` (core), the graph slug,
 * the semantic-graph match normalizer, and the assistant tag normalizer. The
 * pipeline is: trim, lowercase, strip, mapToDash, collapse, trim dashes.
 */
export function normalizeSlug(input: string | undefined, options: NormalizeSlugOptions = {}): string {
  let value = String(input ?? "")
    .trim()
    .toLowerCase();
  if (options.strip) value = value.replace(options.strip, "");
  if (options.mapToDash) value = value.replace(options.mapToDash, "-");
  value = value
    .replace(options.collapse ?? /[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return value || options.fallback || "";
}

/** Splits a comma-separated list, trimming items and dropping empties. */
export function splitList(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Slugs that must not become topic nodes in the deterministic or semantic
 * graph. Union of the previously divergent graph and semantic-graph lists.
 * Intentionally distinct from GRAPH_ALIAS_STOPWORDS below: topic stopwords
 * suppress topic-node creation, alias stopwords suppress repo-alias tokens.
 */
export const GRAPH_TOPIC_STOPWORDS = new Set([
  "doc",
  "docs",
  "document",
  "documents",
  "imported",
  "markdown",
  "markdown-memory",
  "memory",
  "note",
  "notes",
  "overview",
  "project",
  "projects",
  "readme"
]);

/**
 * Tokens too generic to identify a repo when matching sessions/documents to
 * linked repos. Deliberately a separate, smaller list than
 * GRAPH_TOPIC_STOPWORDS (see comment there).
 */
export const GRAPH_ALIAS_STOPWORDS = new Set([
  "all",
  "and",
  "app",
  "apps",
  "code",
  "docs",
  "for",
  "monorepo",
  "repo",
  "service",
  "services",
  "source",
  "the",
  "whole",
  "work"
]);
