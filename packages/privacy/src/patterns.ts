import {
  matchesAnyPattern as coreMatchesAnyPattern,
  matchesPattern as coreMatchesPattern
} from "@zharwing/memory-core";

/**
 * Privacy patterns use the core glob engine in gitignore-style mode:
 * trailing "/" matches directories anywhere, "**"-prefixed literals match by
 * suffix, single-segment wildcards match against the basename, and matching
 * is case-insensitive so differently-cased paths cannot bypass never-send or
 * ignore rules.
 */
export function matchesAnyPattern(filePath: string | undefined, patterns: string[]): boolean {
  return coreMatchesAnyPattern(filePath, patterns, { ignoreStyle: true });
}

export function matchPattern(filePath: string, pattern: string): boolean {
  return coreMatchesPattern(filePath, pattern, { ignoreStyle: true });
}
