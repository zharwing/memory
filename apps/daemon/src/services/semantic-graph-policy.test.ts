import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createProjectModel, type SemanticGraphSettings } from "@aimem/core";
import {
  applySemanticEdgePolicy,
  buildSemanticExtractionPlan,
  mergeSemanticDocumentExtractions,
  semanticExtractionFromProviderJson,
  semanticEdgesFromProposalPatch,
  semanticEdgesProposalPatch,
  semanticJudgementMessages,
  semanticProposalSummaryFromProviderJson,
  semanticProposalSummaryMessages,
  splitSemanticDocumentIntoChunks,
  type SemanticRelationshipCandidate,
  type SemanticRelationshipDecision
} from "@aimem/semantic-graph";

const project = createProjectModel({
  name: "Semantic Graph Test",
  memoryRoot: "/tmp/aimem-semantic-graph-test"
});

const settings: SemanticGraphSettings = {
  version: 1,
  enabled: true,
  mode: "review",
  autoAcceptThreshold: 0.85,
  reviewThreshold: 0.55,
  discardBelowThreshold: 0.35,
  maxCandidatesPerDocument: 12,
  maxClusterSize: 8,
  includeDeterministicSignals: true,
  includeVectorCandidates: false,
  remoteProvidersEnabled: false
};

const candidate: SemanticRelationshipCandidate = {
  id: "candidate-1",
  projectId: project.id,
  sourceDocumentId: "doc-a",
  sourceNodeId: "doc:doc-a",
  targetNodeId: "service:billing",
  targetLabel: "Billing Service",
  targetType: "service",
  suggestedType: "explains",
  score: 9,
  reasons: ["title mentions billing service"],
  deterministicEdgeIds: ["det-1"]
};

describe("applySemanticEdgePolicy", () => {
  it("keeps dry-run edges separate from durable accepted and proposed edges", () => {
    const result = applySemanticEdgePolicy({
      project,
      settings,
      run: {
        id: "run-dry",
        mode: "dry-run",
        providerKind: "llama.cpp",
        model: "local-test"
      },
      candidates: [candidate],
      decisions: [
        relationshipDecision({
          confidence: 0.94,
          reason: "The document explains Billing Service responsibilities.",
          evidence: ["Billing Service owns invoices and payments."]
        })
      ]
    });

    assert.equal(result.acceptedEdges.length, 0);
    assert.equal(result.proposedEdges.length, 0);
    assert.equal(result.dryRunEdges.length, 1);
    assert.equal(result.dryRunEdges[0].status, "proposed");
    assert.equal(result.dryRunEdges[0].source.providerKind, "llama.cpp");
  });

  it("auto-accepts high-confidence edges and proposes reviewable medium-confidence edges", () => {
    const result = applySemanticEdgePolicy({
      project,
      settings,
      run: {
        id: "run-auto",
        mode: "auto",
        providerKind: "llama.cpp",
        model: "local-test"
      },
      candidates: [candidate],
      decisions: [
        relationshipDecision({
          confidence: 0.91,
          reason: "The evidence directly maps the document to Billing Service.",
          evidence: ["Billing Service is the owner of this workflow."]
        }),
        relationshipDecision({
          candidateId: undefined,
          from: "doc:doc-b",
          to: "package:payments-ui",
          type: "supports",
          confidence: 0.62,
          reason: "The note says the package supports payment screens.",
          evidence: ["payments-ui supports payment screens."]
        }),
        relationshipDecision({
          confidence: 0.2,
          reason: "Too weak.",
          evidence: ["Maybe related."]
        })
      ]
    });

    assert.equal(result.acceptedEdges.length, 1);
    assert.equal(result.acceptedEdges[0].status, "auto-accepted");
    assert.equal(result.proposedEdges.length, 1);
    assert.equal(result.proposedEdges[0].status, "proposed");
    assert.equal(result.discardedDecisions.length, 1);
  });

  it("requires reason, evidence, and resolvable endpoints", () => {
    const result = applySemanticEdgePolicy({
      project,
      settings,
      run: {
        id: "run-review",
        mode: "review",
        providerKind: "openai-compatible",
        model: "test"
      },
      decisions: [
        relationshipDecision({
          candidateId: undefined,
          confidence: 0.8,
          reason: "",
          evidence: ["Useful evidence, but no reason."]
        }),
        relationshipDecision({
          candidateId: undefined,
          confidence: 0.8,
          reason: "Reason exists, but evidence is missing.",
          evidence: []
        }),
        relationshipDecision({
          candidateId: undefined,
          confidence: 0.8,
          reason: "Reason and evidence exist, but endpoints are missing.",
          evidence: ["Billing Service is mentioned."]
        })
      ]
    });

    assert.equal(result.acceptedEdges.length, 0);
    assert.equal(result.proposedEdges.length, 0);
    assert.equal(result.discardedDecisions.length, 3);
  });
});

describe("semantic edge proposal patches", () => {
  it("round-trips proposed semantic edges with confidence, reason, and evidence", () => {
    const policy = applySemanticEdgePolicy({
      project,
      settings,
      run: {
        id: "run-review",
        mode: "review",
        providerKind: "mcp",
        model: "external"
      },
      candidates: [candidate],
      decisions: [
        relationshipDecision({
          confidence: 0.72,
          reason: "The document explains the service behavior.",
          evidence: [
            {
              documentId: "doc-a",
              quote: "Billing Service owns invoices.",
              location: "line 12"
            }
          ]
        })
      ]
    });

    const patch = semanticEdgesProposalPatch("run-review", policy.proposedEdges, {
      title: "Billing summary",
      summary: "The model says this document belongs with Billing Service because it explains invoice ownership.",
      keyRelationships: ["Billing doc supports Billing Service."],
      reviewNotes: ["Check the invoice ownership wording."]
    });
    const parsed = semanticEdgesFromProposalPatch(patch);

    assert.equal(parsed?.kind, "semantic-graph-edges");
    assert.equal(parsed?.runId, "run-review");
    assert.equal(parsed?.summary?.summary, "The model says this document belongs with Billing Service because it explains invoice ownership.");
    assert.equal(parsed?.edges.length, 1);
    assert.equal(parsed?.edges[0].from, "doc:doc-a");
    assert.equal(parsed?.edges[0].to, "service:billing");
    assert.equal(parsed?.edges[0].confidence, 0.72);
    assert.equal(parsed?.edges[0].evidence[0].quote, "Billing Service owns invoices.");
  });
});

describe("semantic proposal summary prompt", () => {
  it("asks the provider for real reviewer-facing proposal summaries", () => {
    const policy = applySemanticEdgePolicy({
      project,
      settings,
      run: {
        id: "run-review",
        mode: "review",
        providerKind: "openai-compatible",
        model: "test"
      },
      candidates: [candidate],
      decisions: [
        relationshipDecision({
          confidence: 0.72,
          reason: "The document explains the service behavior.",
          evidence: ["Billing Service owns invoices."]
        })
      ]
    });
    const messages = semanticProposalSummaryMessages({ edges: policy.proposedEdges });
    const prompt = messages.map((message) => message.content).join("\n");

    assert.match(prompt, /reviewer-facing summary/);
    assert.match(prompt, /Use only the supplied relationships/);
    assert.match(prompt, /Do not invent facts/);

    const summary = semanticProposalSummaryFromProviderJson({
      title: "Billing relationship review",
      summary: "The provider explains why the billing document belongs with the billing service.",
      keyRelationships: ["Billing doc supports Billing Service."],
      reviewNotes: ["Confirm the owner wording."]
    });
    assert.equal(summary.title, "Billing relationship review");
    assert.equal(summary.keyRelationships.length, 1);
  });
});

describe("semantic relationship judgement prompt", () => {
  it("guides doc-to-doc decisions away from metadata-only dependency claims", () => {
    const messages = semanticJudgementMessages({
      source: {
        version: 1,
        projectId: project.id,
        documentId: "doc-a",
        contentHash: "hash-a",
        created: "2026-07-05T00:00:00.000Z",
        summary: "Overview says a UI calls a billing API.",
        entities: [],
        concepts: ["billing", "checkout"],
        mentionedFiles: ["services/billing.ts"],
        mentionedPackages: [],
        candidateHints: [],
        sourceMode: "document",
        truncated: false
      },
      candidate: {
        ...candidate,
        id: "candidate-doc",
        targetNodeId: "doc:doc-b",
        targetLabel: "Billing Runtime",
        targetType: "doc",
        suggestedType: "related"
      },
      targetSummary: "Runtime details for the billing API."
    });
    const prompt = messages.map((message) => message.content).join("\n");

    assert.match(prompt, /For doc-to-doc candidates, prefer related/);
    assert.match(prompt, /Reserve uses and depends-on for explicit dependency direction/);
    assert.match(prompt, /evidence only repeats generic topics or related file metadata/);
  });
});

describe("chunked semantic extraction", () => {
  it("splits large markdown documents into bounded heading-aware chunks", () => {
    const chunks = splitSemanticDocumentIntoChunks([
      "# Architecture",
      "Billing service owns invoices.",
      "",
      "## Runtime",
      "A".repeat(900),
      "",
      "## API",
      "B".repeat(900)
    ].join("\n"), 500);

    assert.ok(chunks.length >= 2);
    assert.equal(chunks[0].chunkId, "chunk-0001");
    assert.ok(chunks.some((chunk) => chunk.headingPath.includes("Runtime")));
    assert.ok(chunks.some((chunk) => chunk.location.includes("lines")));
    assert.ok(chunks.every((chunk) => chunk.content.length <= 1200));
  });

  it("merges per-chunk provider extractions into one document extraction", () => {
    const [item] = buildSemanticExtractionPlan({
      project,
      maxDocumentChars: 500,
      documents: [
        {
          id: "doc-big",
          projectId: project.id,
          title: "Large Billing Memory",
          type: "architecture-note",
          status: "active",
          visibility: "ai-eligible",
          topics: ["billing"],
          workstreamIds: [],
          relatedTasks: [],
          relatedFiles: ["services/billing.ts"],
          relatedSessions: [],
          relatedDiagrams: [],
          created: "2026-07-04T00:00:00.000Z",
          updated: "2026-07-04T00:00:00.000Z",
          filePath: "docs/billing.md",
          body: [
            "# Billing",
            "Billing Service owns invoices and payments.",
            "Billing ownership details. ".repeat(80),
            "",
            "## Frontend",
            "@app/payments-ui renders checkout screens.",
            "Checkout package details. ".repeat(80)
          ].join("\n")
        }
      ]
    }).documents;

    const extraction = mergeSemanticDocumentExtractions({
      project,
      item,
      extractions: [
        semanticExtractionFromProviderJson({
          summary: "Billing Service owns invoices.",
          entities: [{ name: "Billing Service", kind: "service", confidence: 0.9 }],
          concepts: ["invoices"],
          mentionedFiles: ["services/billing.ts"],
          mentionedPackages: [],
          candidateHints: [{ targetName: "Billing Service", type: "explains", confidence: 0.8, reason: "explicit ownership" }]
        }, {
          project,
          item,
          chunk: item.chunks[0],
          providerKind: "llama.cpp",
          model: "local"
        }),
        semanticExtractionFromProviderJson({
          summary: "Payments UI renders checkout screens.",
          entities: [{ name: "@app/payments-ui", kind: "package", confidence: 0.8 }],
          concepts: ["checkout"],
          mentionedFiles: [],
          mentionedPackages: ["@app/payments-ui"],
          candidateHints: [{ targetName: "@app/payments-ui", type: "uses", confidence: 0.7, reason: "explicit package mention" }]
        }, {
          project,
          item,
          chunk: item.chunks[1],
          providerKind: "llama.cpp",
          model: "local"
        })
      ],
      providerKind: "llama.cpp",
      model: "local"
    });

    assert.equal(extraction.sourceMode, "chunked");
    assert.ok(item.chunks.length >= 2);
    assert.equal(extraction.chunks?.length, 2);
    assert.deepEqual(extraction.mentionedPackages, ["@app/payments-ui"]);
    assert.ok(extraction.entities.some((entity) => entity.name === "Billing Service"));
    assert.ok(extraction.entities.some((entity) => entity.name === "@app/payments-ui"));
    assert.ok(extraction.candidateHints.some((hint) => hint.targetName === "Billing Service"));
    assert.ok(extraction.summary.includes("Billing Service"));
    assert.ok(extraction.summary.includes("Payments UI"));
  });
});

function relationshipDecision(patch: Partial<SemanticRelationshipDecision>): SemanticRelationshipDecision {
  return {
    candidateId: "candidate-1",
    type: "explains",
    confidence: 0.7,
    reason: "The document explains the target.",
    evidence: ["The target is described in the document."],
    ...patch
  };
}
