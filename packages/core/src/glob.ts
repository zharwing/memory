/**
 * Shared glob matching.
 *
 * Two dispatch modes are supported by matchesPattern/matchesAnyPattern:
 *
 * - Strict glob (default): the whole normalized path must match the pattern.
 *   `**` crosses directory separators (`**` followed by `/` matches zero or
 *   more leading directories), `*` matches within one segment, `?` matches a
 *   single non-separator character. This is the import-walker behavior.
 *
 * - Ignore style (`ignoreStyle: true`): gitignore-flavored loose rules used by
 *   the privacy gate, applied in order:
 *     1. Pattern ending in "/" matches any path containing that directory
 *        segment or ending with the directory name.
 *     2. Pattern starting with "**" + "/" whose remainder has no wildcards
 *        matches any path ending with that literal remainder.
 *     3. Any other pattern containing "**" is matched against the full path
 *        as a strict glob.
 *     4. A pattern with single-segment wildcards (`*`/`?`) is matched against
 *        the basename only, so "*.pem" matches nested files.
 *     5. A wildcard-free pattern matches the exact path or a "/"-delimited
 *        suffix of it.
 *
 * Matching is case-insensitive by default in both modes; pass
 * `caseSensitive: true` to opt out.
 */

export interface GlobMatchOptions {
  /** Compare case-sensitively. Defaults to false (case-insensitive). */
  caseSensitive?: boolean;
  /** Use gitignore-flavored loose matching (see module comment). */
  ignoreStyle?: boolean;
}

export function globToRegExp(pattern: string, options: GlobMatchOptions = {}): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern.slice(index, index + 3) === "**/") {
      source += "(?:.*/)?";
      index += 2;
    } else if (pattern.slice(index, index + 2) === "**") {
      source += ".*";
      index += 1;
    } else if (pattern[index] === "*") {
      source += "[^/]*";
    } else if (pattern[index] === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(pattern[index]);
    }
  }
  return new RegExp(`${source}$`, options.caseSensitive ? "" : "i");
}

export function matchesPattern(input: string, pattern: string, options: GlobMatchOptions = {}): boolean {
  if (options.ignoreStyle) {
    return matchesIgnoreStylePattern(normalizeSlashes(input), normalizeSlashes(pattern), options);
  }
  return globToRegExp(normalizeRelative(pattern), options).test(normalizeRelative(input));
}

export function matchesAnyPattern(
  filePath: string | undefined,
  patterns: string[],
  options: GlobMatchOptions = {}
): boolean {
  if (!filePath) return false;
  return patterns.some((pattern) => matchesPattern(filePath, pattern, options));
}

function matchesIgnoreStylePattern(filePath: string, pattern: string, options: GlobMatchOptions): boolean {
  const compare = options.caseSensitive
    ? (value: string) => value
    : (value: string) => value.toLowerCase();
  const path = compare(filePath);

  if (pattern.endsWith("/")) {
    const dir = compare(pattern);
    return path.includes(`/${dir}`) || path.endsWith(dir.slice(0, -1));
  }

  if (pattern.startsWith("**/") && !hasWildcard(pattern.slice(3))) {
    return path.endsWith(compare(pattern.slice(3)));
  }

  if (pattern.includes("**")) {
    return globToRegExp(pattern, options).test(filePath);
  }

  if (hasWildcard(pattern)) {
    const basename = filePath.split("/").pop() || filePath;
    return globToRegExp(pattern, options).test(basename);
  }

  const literal = compare(pattern);
  return path === literal || path.endsWith(`/${literal}`);
}

function hasWildcard(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?");
}

function normalizeSlashes(input: string): string {
  return input.replace(/\\/g, "/");
}

function normalizeRelative(input: string): string {
  return normalizeSlashes(input).replace(/^\/+/, "");
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
