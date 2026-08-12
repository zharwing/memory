import path from "node:path";
import type { ContextBundle, Project } from "@zharwing/memory-core";
import {
  atomicWriteJson,
  atomicWriteText,
  readBoundedJson,
  withStorageMutationLease
} from "./fs.js";
import {
  DomainEffectOutcomeUnknownError,
  assertDurableDomainEffect,
  assertMatchingDomainEffectMarker,
  createDomainEffectMarker,
  domainValueRevision,
  parseDomainEffectMarker,
  type DurableDomainEffect,
  type DurableDomainEffectMarker
} from "./domain-effects.js";

const CONTEXT_EFFECT_RECORD_SCHEMA = "zharwing.context-bundle-effect.v1";
const MAXIMUM_CONTEXT_EFFECT_BYTES = 16 * 1024 * 1024;

interface StoredContextBundleEffect {
  readonly schema: typeof CONTEXT_EFFECT_RECORD_SCHEMA;
  readonly marker: DurableDomainEffectMarker;
  readonly bundle: ContextBundle;
}

export async function saveContextBundle(
  project: Project,
  bundle: ContextBundle,
  effect?: DurableDomainEffect
): Promise<ContextBundle> {
  if (!effect) return materializeContextBundle(project, bundle);
  assertDurableDomainEffect(effect, project, "memory.get_context_bundle");

  const effectRoot = path.join(project.memoryRoot, "generated", "context-bundles", ".effects");
  const effectPath = path.join(effectRoot, `${effect.effectId}.json`);
  const authoritative = await withStorageMutationLease(effectRoot, "domain-effects", async () => {
    const existing = await readContextEffect(effectPath, effectRoot, project, effect);
    if (existing) return existing;
    if (effect.mode === "reconcile") throw new DomainEffectOutcomeUnknownError();

    const persistedBundle = withoutAuditLogPath(bundle);
    const marker = createDomainEffectMarker({
      effect,
      resultKind: "context-bundle",
      resultId: persistedBundle.id,
      resultRevision: domainValueRevision(persistedBundle),
      committedAt: persistedBundle.created
    });
    const record: StoredContextBundleEffect = {
      schema: CONTEXT_EFFECT_RECORD_SCHEMA,
      marker,
      bundle: persistedBundle
    };
    await atomicWriteJson(effectPath, record, {
      root: effectRoot,
      maximumBytes: MAXIMUM_CONTEXT_EFFECT_BYTES
    });
    return persistedBundle;
  });

  try {
    return await materializeContextBundle(project, authoritative);
  } catch {
    // The authoritative effect record is already durable. A retry must use
    // the same identity to repair the derived artifacts, never create a new
    // bundle with a new id.
    throw new DomainEffectOutcomeUnknownError();
  }
}

async function readContextEffect(
  effectPath: string,
  effectRoot: string,
  project: Project,
  effect: DurableDomainEffect
): Promise<ContextBundle | undefined> {
  const value = await readBoundedJson<unknown>(effectPath, {
    root: effectRoot,
    maximumBytes: MAXIMUM_CONTEXT_EFFECT_BYTES
  });
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainEffectOutcomeUnknownError();
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join("\0") !== ["bundle", "marker", "schema"].sort().join("\0") ||
    record.schema !== CONTEXT_EFFECT_RECORD_SCHEMA
  ) {
    throw new DomainEffectOutcomeUnknownError();
  }
  const marker = parseDomainEffectMarker(record.marker);
  const bundle = parseStoredBundle(record.bundle, project.id);
  assertMatchingDomainEffectMarker(effect, marker, {
    resultKind: "context-bundle",
    resultId: bundle.id,
    resultRevision: domainValueRevision(bundle)
  });
  return bundle;
}

async function materializeContextBundle(
  project: Project,
  bundle: ContextBundle
): Promise<ContextBundle> {
  const markdownPath = path.join(project.memoryRoot, "generated", "context-bundles", `${bundle.id}.md`);
  const auditPath = path.join(project.memoryRoot, "audit", "context-bundles", `${bundle.id}.json`);

  await atomicWriteText(markdownPath, bundle.markdown, {
    root: project.memoryRoot,
    maximumBytes: 8 * 1024 * 1024
  });
  await atomicWriteJson(auditPath, {
    id: bundle.id,
    projectId: bundle.projectId,
    sessionId: bundle.sessionId,
    created: bundle.created,
    requestedBy: bundle.requestedBy,
    includedItems: bundle.includedItems.map(({ content, ...item }) => item),
    excludedItems: bundle.excludedItems,
    redactions: bundle.redactions,
    tokenEstimate: bundle.tokenEstimate,
    safetyStatus: bundle.safetyStatus
  }, {
    root: project.memoryRoot,
    maximumBytes: 8 * 1024 * 1024
  });

  return { ...bundle, auditLogPath: auditPath };
}

function parseStoredBundle(value: unknown, projectId: string): ContextBundle {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainEffectOutcomeUnknownError();
  }
  const bundle = value as ContextBundle;
  if (
    typeof bundle.id !== "string" || !bundle.id || Buffer.byteLength(bundle.id, "utf8") > 512 ||
    bundle.projectId !== projectId ||
    typeof bundle.created !== "string" || !Number.isFinite(Date.parse(bundle.created)) ||
    !Array.isArray(bundle.includedItems) ||
    !Array.isArray(bundle.excludedItems) ||
    !Array.isArray(bundle.redactions) ||
    typeof bundle.tokenEstimate !== "number" || !Number.isFinite(bundle.tokenEstimate) ||
    typeof bundle.markdown !== "string" || Buffer.byteLength(bundle.markdown, "utf8") > 8 * 1024 * 1024
  ) {
    throw new DomainEffectOutcomeUnknownError();
  }
  return withoutAuditLogPath(bundle);
}

function withoutAuditLogPath(bundle: ContextBundle): ContextBundle {
  const { auditLogPath: _auditLogPath, ...persisted } = bundle;
  return persisted;
}
