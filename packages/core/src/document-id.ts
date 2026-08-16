/**
 * Compatibility vocabulary for document identifiers. Storage owns generation
 * and deterministic legacy derivation; core only validates the wire value.
 */
export type DocumentId = string & { readonly __zharwingDocumentId?: never };
export type StoredDocumentId = DocumentId & { readonly __storedDocumentId: unique symbol };
export type LegacyDerivedDocumentId = DocumentId & { readonly __legacyDerivedDocumentId: unique symbol };

export type DocumentIdParseResult =
  | { readonly kind: "stored"; readonly value: StoredDocumentId }
  | { readonly kind: "legacy-derived"; readonly value: LegacyDerivedDocumentId }
  | { readonly kind: "invalid" };

export const LEGACY_DERIVED_DOCUMENT_ID_PREFIX = "doc-legacy-" as const;

/** Strict grammar for newly generated/stored IDs only. */
const NEW_DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/;
const LEGACY_DERIVED_DOCUMENT_ID_PATTERN = /^doc-legacy-[a-f0-9]{32}$/;

export function parseDocumentId(value: string | undefined | null): DocumentId | undefined {
  const parsed = decodeDocumentId(value);
  return parsed.kind === "invalid" ? undefined : parsed.value;
}

export function decodeDocumentId(value: string | undefined | null): DocumentIdParseResult {
  const candidate = value;
  // Persisted IDs are opaque wire keys. Historical imports may contain spaces,
  // Unicode, punctuation, or values beyond the current creation grammar.
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    return { kind: "invalid" };
  }
  if (LEGACY_DERIVED_DOCUMENT_ID_PATTERN.test(candidate)) {
    return { kind: "legacy-derived", value: candidate as LegacyDerivedDocumentId };
  }
  // The reserved namespace constrains new generation, not historical reads.
  // A pre-existing nonblank value that merely resembles it remains opaque.
  return { kind: "stored", value: candidate as StoredDocumentId };
}

export function isDocumentId(value: string): value is DocumentId {
  return parseDocumentId(value) === value;
}

/** Creates a checked stored-ID value; durable generation remains in storage. */
export function createStoredDocumentId(value: string): StoredDocumentId | undefined {
  if (!NEW_DOCUMENT_ID_PATTERN.test(value) || value.startsWith(LEGACY_DERIVED_DOCUMENT_ID_PREFIX)) {
    return undefined;
  }
  return value as StoredDocumentId;
}

/** Formats a storage-derived 128-bit lowercase hex digest in the reserved namespace. */
export function createLegacyDerivedDocumentId(hexDigest: string): LegacyDerivedDocumentId | undefined {
  const candidate = `${LEGACY_DERIVED_DOCUMENT_ID_PREFIX}${hexDigest}`;
  const parsed = decodeDocumentId(candidate);
  return parsed.kind === "legacy-derived" ? parsed.value : undefined;
}
