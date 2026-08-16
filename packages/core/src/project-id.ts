/**
 * Stable project identifier vocabulary shared by storage, daemon adapters, and
 * desktop routing. Existing identifiers are preserved byte-for-byte after
 * validation; this module never renames a registered project.
 */
export type ProjectId = string & { readonly __zharwingProjectId?: never };

/** A validated value used internally at ingress boundaries. */
export type ValidatedProjectId = ProjectId & { readonly __validatedProjectId: unique symbol };

export type ProjectIdParseResult =
  | { readonly kind: "canonical"; readonly value: ValidatedProjectId }
  | { readonly kind: "legacy"; readonly value: ValidatedProjectId }
  | { readonly kind: "invalid"; readonly reason: "missing" | "malformed" };

/** Legacy project records used the full slug output with no 128-character cap. */
const LEGACY_PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CANONICAL_PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;

/**
 * Classifies an ingress value without rewriting persisted legacy identifiers.
 * Consumers that only need compatibility strings use `projectIdValue`.
 */
export function parseProjectId(value: string | undefined | null): ProjectIdParseResult {
  const candidate = value;
  if (!candidate) return { kind: "invalid", reason: "missing" };
  if (candidate === "." || candidate === ".." || !LEGACY_PROJECT_ID_PATTERN.test(candidate)) {
    return { kind: "invalid", reason: "malformed" };
  }
  const validated = candidate as ValidatedProjectId;
  return CANONICAL_PROJECT_ID_PATTERN.test(candidate)
    ? { kind: "canonical", value: validated }
    : { kind: "legacy", value: validated };
}

export function projectIdValue(result: ProjectIdParseResult): ProjectId | undefined {
  return result.kind === "invalid" ? undefined : result.value;
}

/** Explicit compatibility parser for existing string-only callers. */
export function parseLegacyProjectId(value: string | undefined | null): ProjectId | undefined {
  return projectIdValue(parseProjectId(value));
}

export function isProjectId(value: string): value is ProjectId {
  return projectIdValue(parseProjectId(value)) === value;
}

/** Creates a compatible new identifier while leaving legacy identifiers intact. */
export function normalizeNewProjectId(value: string): ProjectId {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
  return projectIdValue(parseProjectId(normalized)) ?? ("project" as ProjectId);
}
