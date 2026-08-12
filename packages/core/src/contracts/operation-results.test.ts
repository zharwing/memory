import assert from "node:assert/strict";
import { test } from "node:test";
import { getOperationDefinition, parseOperationOutput } from "./operation-registry.js";
import { ContractDecodeError } from "./runtime-schema.js";

const semanticSettings = {
  version: 1 as const,
  enabled: true,
  mode: "review" as const,
  autoAcceptThreshold: 0.9,
  reviewThreshold: 0.6,
  discardBelowThreshold: 0.2,
  maxCandidatesPerDocument: 8,
  maxClusterSize: 12,
  includeDeterministicSignals: true,
  includeVectorCandidates: false,
  remoteProvidersEnabled: true
};

const extractionPlan = {
  projectId: "p1",
  generated: "2026-08-12T12:00:00.000Z",
  documents: [
    {
      documentId: "doc-1",
      nodeId: "doc:doc-1",
      title: "Runtime contracts",
      type: "technical-spec",
      status: "active",
      visibility: "ai-eligible",
      topics: ["contracts"],
      relatedFiles: ["packages/core/src/contracts/operation-registry.ts"],
      filePath: "docs/runtime-contracts.md",
      updated: "2026-08-12T11:00:00.000Z",
      contentHash: "sha256:fixture",
      originalCharCount: 120,
      promptCharCount: 100,
      truncated: false,
      redactionCount: 0,
      chunks: [
        {
          chunkId: "chunk-0001",
          index: 0,
          headingPath: ["Runtime contracts"],
          location: "Runtime contracts; lines 1-8",
          startLine: 1,
          endLine: 8,
          originalCharCount: 120,
          promptCharCount: 100
        }
      ]
    }
  ],
  excluded: [],
  counts: { total: 1, eligible: 1, excluded: 0, redacted: 0 }
};

const semanticRun = {
  id: "semantic-run-1",
  projectId: "p1",
  status: "completed",
  mode: "review",
  scope: { kind: "all-docs" },
  providerKind: "openai-compatible",
  model: "fixture-model",
  started: "2026-08-12T12:00:00.000Z",
  finished: "2026-08-12T12:00:01.000Z",
  thresholds: { autoAccept: 0.9, review: 0.6, discardBelow: 0.2 },
  counts: {
    documentsTotal: 1,
    documentsAnalyzed: 1,
    extractionsReused: 0,
    candidates: 1,
    judged: 1,
    accepted: 0,
    proposed: 1,
    rejected: 0,
    discarded: 0
  }
};

test("assistant and provider results use owned runtime schemas", () => {
  const status = {
    state: "ready",
    runtimeType: "lm-studio",
    modelName: "fixture-model",
    message: "Memory Assistant runtime is configured.",
    jobsAvailable: ["session-tldr"],
    recommendedModels: [
      {
        id: "small-instruct-3b-q4",
        label: "Small instruct 3B Q4",
        approximateDownload: "2-3 GB",
        approximateRam: "4-6 GB",
        notes: "Fast local summaries and classification."
      }
    ]
  };
  assert.deepEqual(parseOperationOutput("memory.assistant_status", status), status);

  const provider = {
    ok: true,
    endpoint: "http://127.0.0.1:1234/v1/chat/completions",
    model: "fixture-model",
    modelDisplayName: "Fixture model",
    availableModels: ["fixture-model"],
    latencyMs: 12,
    message: "Provider responded with JSON."
  };
  assert.deepEqual(parseOperationOutput("memory.check_semantic_graph_provider", provider), provider);

  assert.throws(
    () => parseOperationOutput("memory.assistant_status", { ...status, jobsAvailable: "session-tldr" }),
    (error: unknown) => error instanceof ContractDecodeError && error.path === "memory.assistant_status.output.jobsAvailable"
  );
  assert.throws(
    () => parseOperationOutput("memory.check_semantic_graph_provider", { ...provider, latencyMs: "fast" }),
    (error: unknown) => error instanceof ContractDecodeError && error.path === "memory.check_semantic_graph_provider.output.latencyMs"
  );
});

test("semantic preview and analysis results decode their complete daemon shapes", () => {
  const candidateIndex = {
    projectId: "p1",
    generated: "2026-08-12T12:00:00.000Z",
    maxCandidatesPerDocument: 8,
    documents: [],
    candidates: [],
    counts: { documents: 0, candidates: 0 }
  };
  const preview = {
    projectId: "p1",
    generated: "2026-08-12T12:00:00.000Z",
    scope: { kind: "all-docs" },
    settings: semanticSettings,
    candidateIndexPath: "semantic/candidates.json",
    extractionPlan,
    extractionCache: { cached: 0, baseline: 1, missing: 1 },
    candidateIndex,
    counts: {
      documentsTotal: 1,
      documentsEligible: 1,
      documentsExcluded: 0,
      cachedExtractions: 0,
      baselineExtractions: 1,
      candidates: 0
    }
  };
  assert.deepEqual(parseOperationOutput("memory.preview_semantic_graph_analysis", preview), preview);

  const analysis = {
    projectId: "p1",
    run: semanticRun,
    scope: { kind: "all-docs" },
    mode: "review",
    candidateIndexPath: "semantic/candidates.json",
    extractionPlan,
    acceptedEdges: [],
    proposedEdges: [],
    dryRunEdges: [],
    discardedDecisions: []
  };
  assert.deepEqual(parseOperationOutput("memory.analyze_semantic_graph", analysis), analysis);
  assert.deepEqual(
    parseOperationOutput("memory.analyze_semantic_graph", {
      ...analysis,
      run: { ...semanticRun, error: "private provider response body" }
    }),
    analysis,
    "provider exception text must not cross the public operation boundary"
  );

  assert.throws(
    () => parseOperationOutput("memory.preview_semantic_graph_analysis", {
      ...preview,
      extractionCache: { ...preview.extractionCache, cached: "none" }
    }),
    (error: unknown) =>
      error instanceof ContractDecodeError &&
      error.path === "memory.preview_semantic_graph_analysis.output.extractionCache.cached"
  );
  assert.throws(
    () => parseOperationOutput("memory.analyze_semantic_graph", {
      ...analysis,
      run: { ...semanticRun, counts: { ...semanticRun.counts, judged: "one" } }
    }),
    (error: unknown) =>
      error instanceof ContractDecodeError &&
      error.path === "memory.analyze_semantic_graph.output.run.counts.judged"
  );
});

test("provider-check output rejects unregistered provider-controlled fields", () => {
  const valid = {
    ok: true,
    endpoint: "http://127.0.0.1:1234/v1",
    model: "bounded-model",
    latencyMs: 10,
    message: "Provider connection check succeeded."
  };
  assert.deepEqual(
    parseOperationOutput("memory.check_semantic_graph_provider", valid),
    valid
  );
  assert.throws(
    () => parseOperationOutput("memory.check_semantic_graph_provider", {
      ...valid,
      futureProviderField: "PROVIDER_FUTURE_CANARY"
    }),
    ContractDecodeError
  );
});

test("durable context writes and audited mutations declare truthful effects and invalidations", () => {
  const contextBundle = getOperationDefinition("memory.get_context_bundle");
  assert.equal(contextBundle.effect, "mutation");
  assert.equal(contextBundle.idempotency, "required");
  assert.deepEqual(contextBundle.invalidates, ["context-bundles"]);

  const expectedInvalidations = {
    "memory.update_inbox_status": ["inbox", "project-summary", "documents", "project-graph"],
    "memory.update_assistant_policy": ["assistant-policy", "assistant-status", "projects", "project-summary"],
    "memory.update_graph_rules": ["project-graph", "projects", "project-summary"],
    "memory.link_repo": ["project-repos", "project-graph", "projects", "project-summary"],
    "memory.unlink_repo": ["project-repos", "project-graph", "projects", "project-summary"],
    "memory.delete_repo": ["project-repos", "project-graph", "projects", "project-summary", "trash"]
  } as const;

  for (const [name, invalidates] of Object.entries(expectedInvalidations)) {
    assert.deepEqual(
      getOperationDefinition(name as keyof typeof expectedInvalidations).invalidates,
      invalidates,
      name
    );
  }
});
