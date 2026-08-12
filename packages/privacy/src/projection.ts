import {
  isVisibility,
  type AuthenticatedPrincipal,
  type PrincipalAudience,
  type PrivacyPolicy,
  type Visibility
} from "@zharwing/memory-core";
import { matchesAnyPattern } from "./patterns.js";
import { redactSecrets, scanSecrets, type SecretFinding } from "./secrets.js";

export type PrivacySurface = PrincipalAudience;
export type PrivacyProjectionProfile = "hardened-local" | "personal-preview";

export interface PrivacyProjectionLimits {
  readonly maxItems?: number;
  readonly maxBytes?: number;
  readonly maxDepth?: number;
}

interface PrivacyProjectionContextBase {
  readonly principal: AuthenticatedPrincipal;
  readonly projectId?: string;
  readonly surface: PrivacySurface;
  readonly policy: PrivacyPolicy;
  readonly operation?: string;
  readonly limits?: PrivacyProjectionLimits;
}

/**
 * Legacy missing-visibility behavior is possible only through an explicit
 * personal-preview selection and explicit fallback value. Hardened callers
 * can never accidentally inherit the project default.
 */
export type PrivacyProjectionContext =
  | (PrivacyProjectionContextBase & {
      readonly profile: "hardened-local";
      readonly legacyMissingVisibility?: never;
    })
  | (PrivacyProjectionContextBase & {
      readonly profile: "personal-preview";
      readonly legacyMissingVisibility: Visibility;
    });

export type PrivacyProjectionReason =
  | "audience-mismatch"
  | "operation-not-authorized"
  | "principal-project-mismatch"
  | "wrong-project"
  | "never-send"
  | "human-only"
  | "private"
  | "review-required"
  | "missing-visibility"
  | "invalid-visibility"
  | "never-send-pattern"
  | "ignored-path"
  | "secret-detected"
  | "field-withheld"
  | "item-budget"
  | "byte-budget"
  | "depth-budget";

export interface PrivacyExclusionSummary {
  readonly reason: PrivacyProjectionReason;
  readonly count: number;
}

export interface PrivacyRedactionSummary {
  readonly kind: SecretFinding["kind"];
  readonly severity: SecretFinding["severity"];
  readonly replacement: string;
  readonly count: number;
}

export interface PrivacyProjectionProvenance {
  readonly version: "zharwing.privacy-projection.v1";
  readonly principalId: string;
  readonly principalSessionId: string;
  readonly audience: PrincipalAudience;
  readonly surface: PrivacySurface;
  readonly projectId?: string;
  readonly operation?: string;
  readonly policyDigest: string;
  readonly authorityEpoch: number;
  readonly profile: PrivacyProjectionProfile;
}

export interface PrivacyProjectionCompleteness {
  readonly status: "complete" | "partial" | "denied";
  readonly sourceItems: number;
  readonly includedItems: number;
  readonly excludedItems: number;
  readonly truncatedItems: number;
}

export interface PrivacyProjectionResult<T = unknown> {
  readonly allowed: boolean;
  readonly data?: T;
  readonly provenance: PrivacyProjectionProvenance;
  readonly completeness: PrivacyProjectionCompleteness;
  /** Aggregate only: never includes source ids, titles, paths, or content. */
  readonly exclusions: readonly PrivacyExclusionSummary[];
  /** Aggregate only: never includes the matched secret or object path. */
  readonly redactions: readonly PrivacyRedactionSummary[];
}

interface MutableProjectionState {
  sourceItems: number;
  includedItems: number;
  excludedItems: number;
  truncatedItems: number;
  bytes: number;
  exclusions: Map<PrivacyProjectionReason, number>;
  redactions: Map<string, PrivacyRedactionSummary>;
}

interface VisitContext {
  inheritedProjectId?: string;
  arrayItem: boolean;
}

type VisitResult =
  | { included: true; value: unknown }
  | { included: false };

const DEFAULT_MAX_DEPTH = 32;
const PATH_FIELD_PATTERN = /(?:^|_)(?:path|root|directory)$/i;
const KNOWN_PATH_FIELDS = new Set([
  "path",
  "sourcePath",
  "filePath",
  "repoPath",
  "repoRoot",
  "workingDirectory",
  "memoryRoot",
  "originalPath",
  "payloadPath",
  "metadataPath",
  "snapshotPath",
  "outputPath",
  "auditPath",
  "targetPath",
  "sourceRoot",
  "writtenPaths",
  "affectedFiles",
  "relatedFiles",
  "touchedFiles"
]);
const STARTUP_DERIVED_FIELDS = new Set([
  "counts",
  "recommendedAction",
  "contextReadiness",
  "messageForClient"
]);

/**
 * The only general-purpose privacy crossing for structured operation results.
 * It is deterministic and side-effect free; callers serialize only `data`.
 */
export function projectStructuredResult<T = unknown>(
  value: T,
  context: PrivacyProjectionContext
): PrivacyProjectionResult<T> {
  const state: MutableProjectionState = {
    sourceItems: 0,
    includedItems: 0,
    excludedItems: 0,
    truncatedItems: 0,
    bytes: 0,
    exclusions: new Map(),
    redactions: new Map()
  };
  const provenance = createProvenance(context);

  if (context.principal.audience !== context.surface) {
    exclude(state, "audience-mismatch");
    return finish<T>(false, undefined, provenance, state, "denied");
  }
  if (context.operation && !context.principal.operations.includes(context.operation)) {
    exclude(state, "operation-not-authorized");
    return finish<T>(false, undefined, provenance, state, "denied");
  }
  if (
    context.projectId !== undefined &&
    context.principal.projectId !== context.projectId
  ) {
    exclude(state, "principal-project-mismatch");
    return finish<T>(false, undefined, provenance, state, "denied");
  }

  const projected = visit(value, context, state, 0, {
    inheritedProjectId: context.projectId,
    arrayItem: false
  });
  if (!projected.included) {
    return finish<T>(false, undefined, provenance, state, "denied");
  }
  const status = state.excludedItems > 0 || state.truncatedItems > 0
    ? "partial"
    : "complete";
  return finish(true, projected.value as T, provenance, state, status);
}

function visit(
  value: unknown,
  context: PrivacyProjectionContext,
  state: MutableProjectionState,
  depth: number,
  visitContext: VisitContext
): VisitResult {
  if (depth > (context.limits?.maxDepth ?? DEFAULT_MAX_DEPTH)) {
    exclude(state, "depth-budget", true);
    return { included: false };
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return { included: true, value };
  }
  if (typeof value === "string") {
    return projectString(value, context, state);
  }
  if (value === undefined) {
    return { included: true, value };
  }
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    const maxItems = context.limits?.maxItems ?? Number.POSITIVE_INFINITY;
    for (let index = 0; index < value.length; index += 1) {
      state.sourceItems += 1;
      if (state.includedItems >= maxItems) {
        exclude(state, "item-budget", true);
        continue;
      }
      const projected = visit(value[index], context, state, depth + 1, {
        inheritedProjectId: visitContext.inheritedProjectId,
        arrayItem: true
      });
      if (projected.included) {
        result.push(projected.value);
        state.includedItems += 1;
      }
    }
    return { included: true, value: result };
  }
  if (typeof value !== "object") {
    return { included: true, value: String(value) };
  }

  const record = value as Record<string, unknown>;
  const ownProjectId = typeof record.projectId === "string"
    ? record.projectId
    : visitContext.inheritedProjectId;
  if (
    context.projectId !== undefined &&
    ownProjectId !== undefined &&
    ownProjectId !== context.projectId
  ) {
    exclude(state, "wrong-project");
    return { included: false };
  }

  const restricted = isRestrictedSurface(context.surface);
  const entity = isPrivacyEntity(record);
  if (restricted && entity) {
    const visibilityDecision = effectiveVisibility(record.visibility, context);
    if (!visibilityDecision.allowed) {
      exclude(state, visibilityDecision.reason);
      return { included: false };
    }
    if (context.policy.blockOnHighRiskSecrets && containsHighRiskSecret(record)) {
      exclude(state, "secret-detected");
      return { included: false };
    }
  }

  if (restricted) {
    const pathReason = objectPathExclusion(record, context.policy);
    if (pathReason && entity) {
      exclude(state, pathReason);
      return { included: false };
    }
  }

  const projected: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    // These values are derived from disclosure units that may be excluded
    // below. Remove them here; the audience adapter rebuilds bounded truth
    // from the included result instead of forwarding stale/private counts.
    if (
      restricted &&
      depth === 0 &&
      context.operation === "memory.get_startup_state" &&
      STARTUP_DERIVED_FIELDS.has(key)
    ) {
      exclude(state, "field-withheld");
      continue;
    }
    if (restricted && isPathField(key)) {
      exclude(state, "field-withheld");
      continue;
    }
    // ContextBundle's old per-item ledger contains identifiers and paths. The
    // aggregate `exclusions` returned by this service replaces it externally.
    if (restricted && (key === "excluded" || (key === "excludedItems" && Array.isArray(child)))) {
      exclude(state, "field-withheld");
      continue;
    }
    const next = visit(child, context, state, depth + 1, {
      inheritedProjectId: ownProjectId,
      arrayItem: false
    });
    if (next.included && next.value !== undefined) projected[key] = next.value;
  }
  return { included: true, value: projected };
}

function projectString(
  value: string,
  context: PrivacyProjectionContext,
  state: MutableProjectionState
): VisitResult {
  let projected = value;
  if (isRestrictedSurface(context.surface)) {
    const findings = scanSecrets(value);
    if (findings.some((finding) => finding.severity === "high") && context.policy.blockOnHighRiskSecrets) {
      exclude(state, "secret-detected");
      return { included: false };
    }
    if (context.policy.redactSecrets && findings.length > 0) {
      const redacted = redactSecrets(value);
      projected = redacted.content;
      for (const entry of redacted.redactions) addRedaction(state, entry);
    }
  }

  const bytes = utf8Bytes(projected);
  if (state.bytes + bytes > (context.limits?.maxBytes ?? Number.POSITIVE_INFINITY)) {
    exclude(state, "byte-budget", true);
    return { included: false };
  }
  state.bytes += bytes;
  return { included: true, value: projected };
}

function effectiveVisibility(
  value: unknown,
  context: PrivacyProjectionContext
): { allowed: true } | { allowed: false; reason: PrivacyProjectionReason } {
  let visibility: Visibility;
  if (value === undefined) {
    if (context.profile === "hardened-local") {
      return { allowed: false, reason: "missing-visibility" };
    }
    visibility = context.legacyMissingVisibility;
  } else if (!isVisibility(value)) {
    return { allowed: false, reason: "invalid-visibility" };
  } else {
    visibility = value;
  }

  switch (visibility) {
    case "ai-eligible":
    case "ai-pinned":
      return { allowed: true };
    case "review-required":
      return { allowed: false, reason: "review-required" };
    case "human-only":
      return { allowed: false, reason: "human-only" };
    case "private":
      return { allowed: false, reason: "private" };
    case "never-send":
      return { allowed: false, reason: "never-send" };
  }
}

function isPrivacyEntity(record: Record<string, unknown>): boolean {
  if ("visibility" in record) return true;
  // Context-bundle sections use `type` rather than a project id. They are
  // independent disclosure units and must never inherit visibility merely
  // because their enclosing bundle was accepted.
  if (
    typeof record.id === "string" &&
    typeof record.type === "string" &&
    typeof record.title === "string" &&
    typeof record.content === "string"
  ) return true;
  if (typeof record.id === "string" && (
    typeof record.projectId === "string" ||
    "content" in record ||
    "body" in record ||
    "snippet" in record ||
    "summary" in record ||
    "reason" in record ||
    "quote" in record
  )) return true;
  if ("proposedPatch" in record || "taskTitle" in record) return true;
  if ("summary" in record && "nextSteps" in record && "touchedFiles" in record) return true;
  // Startup projections are disclosure units even though their compact wire
  // forms predate visibility metadata. Hardened-local therefore excludes
  // those legacy summaries instead of leaking names/count-derived identity.
  if (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    ("repoCount" in record || "slug" in record || "repos" in record)
  ) return true;
  if ("path" in record && "role" in record && "created" in record) return true;
  if ("quote" in record && ("documentId" in record || "sourcePath" in record)) return true;
  return false;
}

function objectPathExclusion(
  record: Record<string, unknown>,
  policy: PrivacyPolicy
): "never-send-pattern" | "ignored-path" | undefined {
  for (const [key, value] of Object.entries(record)) {
    if (!isPathField(key)) continue;
    const paths = typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    for (const path of paths) {
      if (matchesAnyPattern(path, policy.neverSendPatterns)) return "never-send-pattern";
      if (matchesAnyPattern(path, policy.ignorePatterns)) return "ignored-path";
    }
  }
  return undefined;
}

function containsHighRiskSecret(value: unknown, depth = 0): boolean {
  if (depth > DEFAULT_MAX_DEPTH) return false;
  if (typeof value === "string") {
    return scanSecrets(value).some((finding) => finding.severity === "high");
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsHighRiskSecret(item, depth + 1));
  }
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value as Record<string, unknown>)
    .some((item) => containsHighRiskSecret(item, depth + 1));
}

function isPathField(key: string): boolean {
  return KNOWN_PATH_FIELDS.has(key) || PATH_FIELD_PATTERN.test(key);
}

function isRestrictedSurface(surface: PrivacySurface): boolean {
  return surface === "agent" || surface === "provider";
}

function exclude(
  state: MutableProjectionState,
  reason: PrivacyProjectionReason,
  truncated = false
): void {
  state.excludedItems += 1;
  if (truncated) state.truncatedItems += 1;
  state.exclusions.set(reason, (state.exclusions.get(reason) ?? 0) + 1);
}

function addRedaction(
  state: MutableProjectionState,
  redaction: Omit<PrivacyRedactionSummary, "count"> & { count: number }
): void {
  const key = `${redaction.kind}:${redaction.severity}:${redaction.replacement}`;
  const current = state.redactions.get(key);
  state.redactions.set(key, {
    kind: redaction.kind,
    severity: redaction.severity,
    replacement: redaction.replacement,
    count: (current?.count ?? 0) + redaction.count
  });
}

function createProvenance(context: PrivacyProjectionContext): PrivacyProjectionProvenance {
  return Object.freeze({
    version: "zharwing.privacy-projection.v1",
    principalId: context.principal.principalId,
    principalSessionId: context.principal.sessionId,
    audience: context.principal.audience,
    surface: context.surface,
    projectId: context.projectId,
    operation: context.operation,
    policyDigest: context.principal.policyDigest,
    authorityEpoch: context.principal.authorityEpoch,
    profile: context.profile
  });
}

function finish<T>(
  allowed: boolean,
  data: T | undefined,
  provenance: PrivacyProjectionProvenance,
  state: MutableProjectionState,
  status: PrivacyProjectionCompleteness["status"]
): PrivacyProjectionResult<T> {
  return {
    allowed,
    ...(allowed ? { data } : {}),
    provenance,
    completeness: Object.freeze({
      status,
      sourceItems: state.sourceItems,
      includedItems: state.includedItems,
      excludedItems: state.excludedItems,
      truncatedItems: state.truncatedItems
    }),
    exclusions: Object.freeze(
      [...state.exclusions.entries()].map(([reason, count]) => Object.freeze({ reason, count }))
    ),
    redactions: Object.freeze([...state.redactions.values()].map((entry) => Object.freeze({ ...entry })))
  };
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
