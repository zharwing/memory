import type { SessionSummary } from "@zharwing/memory-core";

export interface SessionSummaryFingerprint {
  readonly mtimeMs: number;
  readonly size: number;
}

interface SessionSummaryCacheEntry extends SessionSummaryFingerprint {
  readonly summary: SessionSummary;
}

const DEFAULT_MAX_SESSION_SUMMARIES = 512;

/**
 * Instance-owned, bounded LRU cache for session frontmatter summaries.
 *
 * A fingerprint is required for every lookup so a caller cannot accidentally
 * reuse a summary after the underlying file changes. Disposing the cache is
 * terminal; repositories must create a new cache for a new lifetime.
 */
export class SessionSummaryCache {
  readonly #entries = new Map<string, SessionSummaryCacheEntry>();
  readonly #maximumEntries: number;
  #disposed = false;

  constructor(maximumEntries = DEFAULT_MAX_SESSION_SUMMARIES) {
    if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 1) {
      throw new RangeError("Session summary cache capacity must be a positive safe integer.");
    }
    this.#maximumEntries = maximumEntries;
  }

  get(filePath: string, fingerprint: SessionSummaryFingerprint): SessionSummary | undefined {
    this.#assertActive();
    const cached = this.#entries.get(filePath);
    if (!cached) return undefined;
    if (cached.mtimeMs !== fingerprint.mtimeMs || cached.size !== fingerprint.size) {
      this.#entries.delete(filePath);
      return undefined;
    }

    // Refresh insertion order so the first key remains the least recently used.
    this.#entries.delete(filePath);
    this.#entries.set(filePath, cached);
    return cached.summary;
  }

  set(
    filePath: string,
    fingerprint: SessionSummaryFingerprint,
    summary: SessionSummary
  ): void {
    this.#assertActive();
    this.#entries.delete(filePath);
    this.#entries.set(filePath, { ...fingerprint, summary });
    while (this.#entries.size > this.#maximumEntries) {
      const oldestKey = this.#entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.#entries.delete(oldestKey);
    }
  }

  delete(filePath: string): boolean {
    this.#assertActive();
    return this.#entries.delete(filePath);
  }

  clear(): void {
    this.#assertActive();
    this.#entries.clear();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#entries.clear();
    this.#disposed = true;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("Session summary cache has been disposed.");
    }
  }
}
