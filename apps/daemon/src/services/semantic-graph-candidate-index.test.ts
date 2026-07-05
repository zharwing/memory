import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProjectModel,
  type MemoryDocument,
  type ProjectGraph,
  type SemanticDocumentExtraction,
  type SemanticGraphSettings
} from "@aimem/core";
import {
  applySemanticEdgePolicy,
  buildSemanticCandidateIndex,
  type SemanticRelationshipDecision
} from "@aimem/semantic-graph";

const project = createProjectModel({
  name: "Semantic Candidate Test",
  memoryRoot: "/tmp/aimem-semantic-candidate-test"
});

const settings: SemanticGraphSettings = {
  version: 1,
  enabled: true,
  mode: "review",
  autoAcceptThreshold: 0.9,
  reviewThreshold: 0.62,
  discardBelowThreshold: 0.35,
  maxCandidatesPerDocument: 3,
  maxClusterSize: 8,
  includeDeterministicSignals: true,
  includeVectorCandidates: false,
  remoteProvidersEnabled: false
};

test("buildSemanticCandidateIndex prioritizes doc relationships over file and topic metadata", () => {
  const documents = [
    doc("doc-overview", "Billing Overview", ["billing", "checkout"], ["apps/payments-ui/checkout.tsx", "services/billing.ts"]),
    doc("doc-runtime", "Billing Runtime", ["billing", "runtime"], ["services/billing.ts"]),
    doc("doc-payments", "Payments UI", ["payments", "checkout"], ["apps/payments-ui/checkout.tsx", "services/billing.ts"])
  ];
  const index = buildSemanticCandidateIndex({
    project,
    documents,
    graph: projectGraph(),
    settings,
    extractions: [
      extraction("doc-overview", ["billing", "checkout", "payments ui", "billing runtime"])
    ]
  });

  const overviewSet = index.documents.find((set) => set.documentId === "doc-overview");
  assert.ok(overviewSet);
  assert.equal(overviewSet.candidates.length, 3);
  assert.deepEqual(
    overviewSet.candidates.slice(0, 2).map((candidate) => candidate.targetNodeId).sort(),
    ["doc:doc-payments", "doc:doc-runtime"]
  );
  assert.equal(
    overviewSet.candidates.filter((candidate) => candidate.targetType === "file" || candidate.targetType === "topic").length,
    1
  );
});

test("applySemanticEdgePolicy deduplicates inverse related doc edges", () => {
  const result = applySemanticEdgePolicy({
    project,
    settings,
    run: {
      id: "run-related-dedupe",
      mode: "review",
      providerKind: "openai-compatible",
      model: "test"
    },
    decisions: [
      decision("doc:doc-overview", "doc:doc-runtime", 0.72, "Shared billing concepts."),
      decision("doc:doc-runtime", "doc:doc-overview", 0.91, "Runtime expands the overview.")
    ]
  });

  assert.equal(result.proposedEdges.length, 1);
  assert.equal(result.proposedEdges[0].confidence, 0.91);
  assert.equal(result.proposedEdges[0].from, "doc:doc-runtime");
  assert.equal(result.counts.judged, 2);
  assert.equal(result.counts.proposed, 1);
  assert.equal(result.counts.discarded, 1);
});

function projectGraph(): ProjectGraph {
  return {
    projectId: project.id,
    generated: "2026-07-05T00:00:00.000Z",
    nodes: [
      { id: "doc:doc-overview", projectId: project.id, type: "doc", label: "Billing Overview" },
      { id: "doc:doc-runtime", projectId: project.id, type: "doc", label: "Billing Runtime" },
      { id: "doc:doc-payments", projectId: project.id, type: "doc", label: "Payments UI" },
      { id: "file:apps/payments-ui/checkout.tsx", projectId: project.id, type: "file", label: "apps/payments-ui/checkout.tsx" },
      { id: "file:services/billing.ts", projectId: project.id, type: "file", label: "services/billing.ts" },
      { id: "topic:billing", projectId: project.id, type: "topic", label: "billing" },
      { id: "topic:checkout", projectId: project.id, type: "topic", label: "checkout" }
    ],
    edges: [
      edge("doc:doc-overview", "file:apps/payments-ui/checkout.tsx", "supports"),
      edge("doc:doc-overview", "file:services/billing.ts", "supports"),
      edge("doc:doc-overview", "topic:billing", "mentions"),
      edge("doc:doc-overview", "topic:checkout", "mentions")
    ]
  };
}

function edge(from: string, to: string, type: ProjectGraph["edges"][number]["type"]): ProjectGraph["edges"][number] {
  return {
    id: `edge:${from}:${to}:${type}`,
    projectId: project.id,
    from,
    to,
    type,
    reason: "test graph edge",
    sourceKind: "deterministic"
  };
}

function doc(id: string, title: string, topics: string[], relatedFiles: string[]): MemoryDocument {
  return {
    id,
    projectId: project.id,
    title,
    type: "architecture-note",
    status: "active",
    visibility: "ai-eligible",
    topics,
    workstreamIds: [],
    relatedTasks: [],
    relatedFiles,
    relatedSessions: [],
    relatedDiagrams: [],
    created: "2026-07-05T00:00:00.000Z",
    updated: "2026-07-05T00:00:00.000Z",
    filePath: `docs/${id}.md`,
    body: `${title} covers ${topics.join(", ")}.`,
    format: "markdown"
  };
}

function extraction(documentId: string, concepts: string[]): SemanticDocumentExtraction {
  return {
    version: 1,
    projectId: project.id,
    documentId,
    contentHash: `hash-${documentId}`,
    created: "2026-07-05T00:00:00.000Z",
    summary: `${documentId} summary`,
    entities: [],
    concepts,
    mentionedFiles: [],
    mentionedPackages: [],
    candidateHints: [],
    sourceMode: "document",
    truncated: false
  };
}

function decision(from: string, to: string, confidence: number, reason: string): SemanticRelationshipDecision {
  return {
    from,
    to,
    type: "related",
    confidence,
    reason,
    evidence: [`${from} relates to ${to}.`]
  };
}
