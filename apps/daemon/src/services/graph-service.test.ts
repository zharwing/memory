import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProjectGraph, ProposedMemoryUpdate, SemanticGraphEdge, SemanticGraphEdgeStatus } from "@zharwing/memory-core";
import { mergeSemanticEdgesIntoGraph, semanticEdgesFromInboxProposals } from "./graph-service.js";

const generated = "2026-07-04T00:00:00.000Z";

describe("mergeSemanticEdgesIntoGraph", () => {
  it("keeps deterministic graph clean unless semantic overlays are requested", () => {
    const graph = projectGraph();
    const merged = mergeSemanticEdgesIntoGraph({
      graph,
      semanticEdges: semanticEdges(),
      includeSemantic: "none",
      includeSemanticProposals: false
    });

    assert.equal(merged.edges.length, graph.edges.length);
    assert.deepEqual(merged.edges, graph.edges);
  });

  it("merges accepted semantic metadata into matching deterministic edges", () => {
    const merged = mergeSemanticEdgesIntoGraph({
      graph: projectGraph(),
      semanticEdges: semanticEdges(),
      includeSemantic: "accepted",
      includeSemanticProposals: false
    });

    const deterministicEdge = merged.edges.find((edge) => edge.id === "det-supports");
    assert.equal(deterministicEdge?.sourceKind, "deterministic+semantic");
    assert.equal(deterministicEdge?.semanticEdgeId, "sem-accepted");
    assert.equal(deterministicEdge?.semanticStatus, "accepted");
    assert.equal(deterministicEdge?.confidence, 0.88);
    assert.match(deterministicEdge?.reason || "", /Semantic evidence/);
    assert.equal(merged.edges.some((edge) => edge.semanticStatus === "proposed"), false);
    assert.equal(merged.edges.some((edge) => edge.semanticStatus === "rejected"), false);
  });

  it("adds proposed edges only for AI review overlays and ignores edges with missing nodes", () => {
    const merged = mergeSemanticEdgesIntoGraph({
      graph: projectGraph(),
      semanticEdges: semanticEdges(),
      includeSemantic: "all",
      includeSemanticProposals: true
    });

    const proposedEdge = merged.edges.find((edge) => edge.semanticEdgeId === "sem-proposed");
    assert.equal(proposedEdge?.sourceKind, "semantic");
    assert.equal(proposedEdge?.semanticStatus, "proposed");
    assert.equal(proposedEdge?.from, "doc:doc-a");
    assert.equal(proposedEdge?.to, "package:payments-ui");
    assert.equal(merged.edges.some((edge) => edge.semanticEdgeId === "sem-rejected"), false);
    assert.equal(merged.edges.some((edge) => edge.semanticEdgeId === "sem-missing"), false);
  });
});

describe("semanticEdgesFromInboxProposals", () => {
  it("projects pending and edited semantic proposal edges with proposal edge ids", () => {
    const edges = semanticEdgesFromInboxProposals("project-a", [
      proposal("proposal-a", "pending"),
      proposal("proposal-b", "edited"),
      proposal("proposal-c", "rejected")
    ]);

    assert.equal(edges.length, 2);
    assert.deepEqual(edges.map((edge) => edge.id), ["proposal:proposal-a:0", "proposal:proposal-b:0"]);
    assert.equal(edges[0].status, "proposed");
    assert.equal(edges[0].source.kind, "llm");
    assert.equal(edges[0].source.runId, "run-proposal");
  });
});

function projectGraph(): ProjectGraph {
  return {
    projectId: "project-a",
    generated,
    nodes: [
      { id: "doc:doc-a", projectId: "project-a", type: "doc", label: "Billing Memory" },
      { id: "service:billing", projectId: "project-a", type: "service", label: "Billing Service" },
      { id: "package:payments-ui", projectId: "project-a", type: "package", label: "Payments UI" }
    ],
    edges: [
      {
        id: "det-supports",
        projectId: "project-a",
        from: "doc:doc-a",
        to: "service:billing",
        type: "supports",
        reason: "Deterministic topic match.",
        sourceKind: "deterministic"
      }
    ]
  };
}

function semanticEdges(): SemanticGraphEdge[] {
  return [
    semanticEdge("sem-accepted", "doc:doc-a", "service:billing", "supports", "accepted", 0.88),
    semanticEdge("sem-auto", "service:billing", "package:payments-ui", "uses", "auto-accepted", 0.91),
    semanticEdge("sem-proposed", "doc:doc-a", "package:payments-ui", "explains", "proposed", 0.67),
    semanticEdge("sem-rejected", "package:payments-ui", "doc:doc-a", "related", "rejected", 0.8),
    semanticEdge("sem-missing", "doc:doc-a", "service:unknown", "related", "accepted", 0.95)
  ];
}

function semanticEdge(
  id: string,
  from: string,
  to: string,
  type: SemanticGraphEdge["type"],
  status: SemanticGraphEdgeStatus,
  confidence: number
): SemanticGraphEdge {
  return {
    id,
    projectId: "project-a",
    from,
    to,
    type,
    status,
    confidence,
    reason: `${id} semantic reason.`,
    evidence: [
      {
        documentId: "doc-a",
        quote: `${id} evidence.`
      }
    ],
    source: {
      kind: "llm",
      runId: "run-a"
    },
    created: generated,
    updated: generated
  };
}

function proposal(id: string, status: ProposedMemoryUpdate["status"]): ProposedMemoryUpdate {
  return {
    id,
    projectId: "project-a",
    type: "graph-update",
    status,
    sourceKind: "memory-assistant",
    sourceAgent: "semantic-test",
    created: generated,
    confidence: "medium",
    affectedFiles: ["docs/billing.md"],
    reason: "Semantic graph proposal",
    proposedPatch: JSON.stringify({
      kind: "semantic-graph-edges",
      runId: "run-proposal",
      edges: [
        {
          from: "doc:doc-a",
          to: "service:billing",
          type: "explains",
          confidence: 0.7,
          reason: "The document explains Billing Service.",
          evidence: [{ documentId: "doc-a", quote: "Billing Service is explained." }]
        }
      ]
    })
  };
}
