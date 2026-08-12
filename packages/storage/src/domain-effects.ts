import crypto from "node:crypto";
import type { Project } from "@zharwing/memory-core";

export const DURABLE_DOMAIN_EFFECT_SCHEMA = "zharwing.domain-effect.v1" as const;
const DOMAIN_EFFECT_MARKERS = Symbol.for("zharwing.memory.domain-effect-markers.v1");
const MAXIMUM_DOMAIN_MARKERS = 2_048;

export type DurableDomainEffectOperation =
  | "memory.start_session"
  | "memory.save_checkpoint"
  | "memory.close_session"
  | "memory.get_context_bundle";

export interface DurableDomainEffect {
  readonly schema: typeof DURABLE_DOMAIN_EFFECT_SCHEMA;
  /** Stable digest of owner + project generation + operation + caller key. */
  readonly effectId: string;
  readonly projectGeneration: string;
  readonly operation: DurableDomainEffectOperation;
  readonly inputDigest: string;
  /** Per-effect verification key derived by the daemon journal; never persisted. */
  readonly markerKey: string;
  readonly mode: "apply" | "reconcile";
}

export interface DurableDomainEffectMarker {
  readonly schema: typeof DURABLE_DOMAIN_EFFECT_SCHEMA;
  readonly effectId: string;
  readonly projectGeneration: string;
  readonly operation: DurableDomainEffectOperation;
  readonly inputDigest: string;
  readonly mac: string;
  readonly resultKind: "session" | "context-bundle";
  readonly resultId: string;
  readonly resultRevision: string;
  readonly committedAt: string;
}

type DomainMarked = {
  [DOMAIN_EFFECT_MARKERS]?: readonly DurableDomainEffectMarker[];
};

/** The durable claim exists, but its domain outcome cannot be proved. */
export class DomainEffectOutcomeUnknownError extends Error {
  readonly code = "outcome_unknown" as const;

  constructor() {
    super("The durable domain effect outcome cannot be reconciled.");
    this.name = "DomainEffectOutcomeUnknownError";
  }
}

/** One caller key was already bound to a different canonical input. */
export class DomainEffectConflictError extends Error {
  readonly code = "conflict" as const;

  constructor() {
    super("The durable domain effect identity conflicts with an existing effect.");
    this.name = "DomainEffectConflictError";
  }
}

/**
 * Project creation time is immutable in the registry model and changes when a
 * deleted project id is created again. Hashing it with the id gives transports
 * a relocation-independent generation without exposing either value in an
 * effect marker or journal.
 */
export function projectGeneration(project: Pick<Project, "id" | "created">): string {
  assertBoundedText(project.id, "project id", 512);
  assertBoundedText(project.created, "project creation", 128);
  if (!Number.isFinite(Date.parse(project.created))) {
    throw new Error("Project creation time is invalid.");
  }
  return digestParts("zharwing.project-generation.v1", [project.id, project.created]);
}

export function isDurableDomainEffectOperation(
  operation: string
): operation is DurableDomainEffectOperation {
  return operation === "memory.start_session" ||
    operation === "memory.save_checkpoint" ||
    operation === "memory.close_session" ||
    operation === "memory.get_context_bundle";
}

export function assertDurableDomainEffect(
  effect: DurableDomainEffect,
  project: Pick<Project, "id" | "created">,
  operation: DurableDomainEffectOperation
): void {
  if (!effect || effect.schema !== DURABLE_DOMAIN_EFFECT_SCHEMA) {
    throw new DomainEffectOutcomeUnknownError();
  }
  assertDigest(effect.effectId, "effect id");
  assertDigest(effect.projectGeneration, "project generation");
  assertDigest(effect.inputDigest, "input digest");
  assertDigest(effect.markerKey, "effect marker key");
  if (effect.operation !== operation || !["apply", "reconcile"].includes(effect.mode)) {
    throw new DomainEffectOutcomeUnknownError();
  }
  if (effect.projectGeneration !== projectGeneration(project)) {
    throw new DomainEffectConflictError();
  }
}

export function createDomainEffectMarker(args: {
  effect: DurableDomainEffect;
  resultKind: DurableDomainEffectMarker["resultKind"];
  resultId: string;
  resultRevision: string;
  committedAt: string;
}): DurableDomainEffectMarker {
  assertBoundedText(args.resultId, "domain result id", 512);
  assertDigest(args.resultRevision, "domain result revision");
  if (!Number.isFinite(Date.parse(args.committedAt))) {
    throw new Error("Domain effect commit time is invalid.");
  }
  const unsigned = {
    schema: DURABLE_DOMAIN_EFFECT_SCHEMA,
    effectId: args.effect.effectId,
    projectGeneration: args.effect.projectGeneration,
    operation: args.effect.operation,
    inputDigest: args.effect.inputDigest,
    resultKind: args.resultKind,
    resultId: args.resultId,
    resultRevision: args.resultRevision,
    committedAt: args.committedAt
  } as const;
  return Object.freeze({
    ...unsigned,
    mac: crypto.createHmac("sha256", Buffer.from(args.effect.markerKey, "hex"))
      .update("zharwing.domain-effect-result.v1\0", "utf8")
      .update(JSON.stringify(unsigned), "utf8")
      .digest("hex")
  });
}

export function assertMatchingDomainEffectMarker(
  effect: DurableDomainEffect,
  marker: DurableDomainEffectMarker,
  expected: {
    resultKind: DurableDomainEffectMarker["resultKind"];
    resultId?: string;
    resultRevision?: string;
  }
): void {
  if (marker.effectId !== effect.effectId) {
    throw new DomainEffectOutcomeUnknownError();
  }
  if (marker.inputDigest !== effect.inputDigest) {
    throw new DomainEffectConflictError();
  }
  if (
    marker.schema !== effect.schema ||
    marker.projectGeneration !== effect.projectGeneration ||
    marker.operation !== effect.operation ||
    marker.resultKind !== expected.resultKind ||
    (expected.resultId !== undefined && marker.resultId !== expected.resultId) ||
    (expected.resultRevision !== undefined && marker.resultRevision !== expected.resultRevision)
  ) {
    throw new DomainEffectOutcomeUnknownError();
  }
  const { mac, ...unsigned } = marker;
  const expectedMac = crypto.createHmac("sha256", Buffer.from(effect.markerKey, "hex"))
    .update("zharwing.domain-effect-result.v1\0", "utf8")
    .update(JSON.stringify(unsigned), "utf8")
    .digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expectedMac, "hex"))) {
    throw new DomainEffectOutcomeUnknownError();
  }
}

export function parseDomainEffectMarker(value: unknown): DurableDomainEffectMarker {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainEffectOutcomeUnknownError();
  }
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    "committedAt",
    "effectId",
    "inputDigest",
    "mac",
    "operation",
    "projectGeneration",
    "resultId",
    "resultKind",
    "resultRevision",
    "schema"
  ].sort();
  if (Object.keys(record).sort().join("\0") !== expectedKeys.join("\0")) {
    throw new DomainEffectOutcomeUnknownError();
  }
  if (
    record.schema !== DURABLE_DOMAIN_EFFECT_SCHEMA ||
    typeof record.effectId !== "string" || !isDigest(record.effectId) ||
    typeof record.projectGeneration !== "string" || !isDigest(record.projectGeneration) ||
    typeof record.operation !== "string" || !isDurableDomainEffectOperation(record.operation) ||
    typeof record.inputDigest !== "string" || !isDigest(record.inputDigest) ||
    typeof record.mac !== "string" || !isDigest(record.mac) ||
    (record.resultKind !== "session" && record.resultKind !== "context-bundle") ||
    typeof record.resultId !== "string" || !record.resultId || Buffer.byteLength(record.resultId, "utf8") > 512 ||
    typeof record.resultRevision !== "string" || !isDigest(record.resultRevision) ||
    typeof record.committedAt !== "string" || !Number.isFinite(Date.parse(record.committedAt))
  ) {
    throw new DomainEffectOutcomeUnknownError();
  }
  return Object.freeze({
    schema: DURABLE_DOMAIN_EFFECT_SCHEMA,
    effectId: record.effectId,
    projectGeneration: record.projectGeneration,
    operation: record.operation as DurableDomainEffectOperation,
    inputDigest: record.inputDigest,
    mac: record.mac,
    resultKind: record.resultKind as DurableDomainEffectMarker["resultKind"],
    resultId: record.resultId,
    resultRevision: record.resultRevision,
    committedAt: record.committedAt
  });
}

export function getDomainEffectMarkers(value: object): readonly DurableDomainEffectMarker[] {
  const markers = (value as DomainMarked)[DOMAIN_EFFECT_MARKERS] ?? [];
  if (markers.length > MAXIMUM_DOMAIN_MARKERS) {
    throw new DomainEffectOutcomeUnknownError();
  }
  return markers;
}

export function attachDomainEffectMarkers<T extends object>(
  value: T,
  markers: readonly DurableDomainEffectMarker[]
): T {
  if (markers.length > MAXIMUM_DOMAIN_MARKERS) {
    throw new Error("Domain effect marker capacity exceeded.");
  }
  Object.defineProperty(value, DOMAIN_EFFECT_MARKERS, {
    value: Object.freeze([...markers]),
    enumerable: true,
    configurable: false,
    writable: false
  });
  return value;
}

export function appendDomainEffectMarker<T extends object>(
  value: T,
  marker: DurableDomainEffectMarker,
  effect: DurableDomainEffect
): T {
  assertMatchingDomainEffectMarker(effect, marker, {
    resultKind: marker.resultKind,
    resultId: marker.resultId,
    resultRevision: marker.resultRevision
  });
  const current = getDomainEffectMarkers(value);
  const existing = current.find((candidate) => candidate.effectId === marker.effectId);
  if (existing) {
    assertMatchingDomainEffectMarker({
      schema: DURABLE_DOMAIN_EFFECT_SCHEMA,
      effectId: marker.effectId,
      projectGeneration: marker.projectGeneration,
      operation: marker.operation,
      inputDigest: marker.inputDigest,
      markerKey: effect.markerKey,
      mode: "reconcile"
    }, existing, {
      resultKind: marker.resultKind,
      resultId: marker.resultId,
      resultRevision: marker.resultRevision
    });
    return value;
  }
  return attachDomainEffectMarkers(value, [...current, marker]);
}

export function encodeDomainEffectMarkers(value: object): string[] {
  return getDomainEffectMarkers(value).map((marker) => JSON.stringify(marker));
}

export function decodeDomainEffectMarkers(value: unknown): DurableDomainEffectMarker[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAXIMUM_DOMAIN_MARKERS) {
    throw new DomainEffectOutcomeUnknownError();
  }
  return value.map((item) => {
    if (typeof item !== "string" || Buffer.byteLength(item, "utf8") > 2_048) {
      throw new DomainEffectOutcomeUnknownError();
    }
    try {
      return parseDomainEffectMarker(JSON.parse(item) as unknown);
    } catch (error) {
      if (error instanceof DomainEffectOutcomeUnknownError) throw error;
      throw new DomainEffectOutcomeUnknownError();
    }
  });
}

export function domainValueRevision(value: unknown): string {
  return crypto.createHash("sha256")
    .update("zharwing.domain-result-revision.v1\0", "utf8")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

function digestParts(domain: string, values: readonly string[]): string {
  const hash = crypto.createHash("sha256").update(`${domain}\0`, "utf8");
  for (const value of values) {
    const bytes = Buffer.from(value, "utf8");
    hash.update(String(bytes.length), "utf8").update(":", "utf8").update(bytes).update("\0", "utf8");
  }
  return hash.digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite domain value.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(object[key])}`
    ).join(",")}}`;
  }
  if (value === undefined) return "null";
  throw new Error("Unsupported domain value.");
}

function assertDigest(value: string, label: string): void {
  if (!isDigest(value)) throw new Error(`Invalid ${label}.`);
}

function isDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function assertBoundedText(value: string, label: string, maximumBytes: number): void {
  if (!value || Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw new Error(`Invalid ${label}.`);
  }
}
