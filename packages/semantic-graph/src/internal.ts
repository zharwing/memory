import { GRAPH_TOPIC_STOPWORDS, normalizeSlug } from "@zharwing/memory-core";

/**
 * Shared internal helpers for the semantic-graph modules. Not exported from
 * the package barrel.
 */

export const DEFAULT_MAX_DOCUMENT_CHARS = 12000;

export function documentNodeId(documentId: string): string {
  return `doc:${documentId}`;
}

export function normalizeTextForMatch(input: string | undefined): string {
  return normalizeSlug(input, { strip: /@/g, mapToDash: /[_./\\]+/g, collapse: /[^a-z0-9-]+/g });
}

export function tokenSet(input: string): Set<string> {
  return new Set(
    input
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !GRAPH_TOPIC_STOPWORDS.has(token))
  );
}
