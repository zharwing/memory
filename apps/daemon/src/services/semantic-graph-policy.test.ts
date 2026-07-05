import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createProjectModel, type SemanticGraphSettings } from "@aimem/core";
import {
  applySemanticEdgePolicy,
  semanticEdgesFromProposalPatch,
  semanticEdgesProposalPatch,
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

    const patch = semanticEdgesProposalPatch("run-review", policy.proposedEdges);
    const parsed = semanticEdgesFromProposalPatch(patch);

    assert.equal(parsed?.kind, "semantic-graph-edges");
    assert.equal(parsed?.runId, "run-review");
    assert.equal(parsed?.edges.length, 1);
    assert.equal(parsed?.edges[0].from, "doc:doc-a");
    assert.equal(parsed?.edges[0].to, "service:billing");
    assert.equal(parsed?.edges[0].confidence, 0.72);
    assert.equal(parsed?.edges[0].evidence[0].quote, "Billing Service owns invoices.");
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
