import { buildProjectGraph } from "@aimem/graph";
import type { ProjectRegistry } from "@aimem/storage";
import {
  listProjectDocuments,
  listProjectSessions,
  listProjectWorkstreams,
  readSemanticEdges
} from "@aimem/storage";
import type {
  GraphEdge,
  ProjectGraph,
  SemanticGraphEdge,
  SemanticGraphEdgeStatus
} from "@aimem/core";
import { resolveProject } from "./project-resolver.js";

type SemanticGraphIncludeMode = "none" | "accepted" | "all";

export class GraphService {
  constructor(private readonly registry: ProjectRegistry) {}

  async getGraph(params: {
    projectId: string;
    includeSemantic?: SemanticGraphIncludeMode;
    includeSemanticProposals?: boolean;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const [workstreams, sessions, documents, semanticEdges] = await Promise.all([
      listProjectWorkstreams(project),
      listProjectSessions(project),
      listProjectDocuments(project),
      readSemanticEdges(project)
    ]);
    const graph = buildProjectGraph({
      project,
      workstreams,
      sessions,
      documents
    });

    const includeSemantic = params.includeSemantic || "none";
    if (includeSemantic === "none" && !params.includeSemanticProposals) return graph;

    return mergeSemanticEdgesIntoGraph({
      graph,
      semanticEdges: semanticEdges.edges,
      includeSemantic,
      includeSemanticProposals: Boolean(params.includeSemanticProposals)
    });
  }
}

function mergeSemanticEdgesIntoGraph(args: {
  graph: ProjectGraph;
  semanticEdges: SemanticGraphEdge[];
  includeSemantic: SemanticGraphIncludeMode;
  includeSemanticProposals: boolean;
}): ProjectGraph {
  const nodeIds = new Set(args.graph.nodes.map((node) => node.id));
  const edgesByKey = new Map(args.graph.edges.map((edge) => [graphEdgeKey(edge), edge]));
  const nextEdges = [...args.graph.edges];

  for (const semanticEdge of args.semanticEdges) {
    if (!shouldIncludeSemanticEdge(semanticEdge.status, args.includeSemantic, args.includeSemanticProposals)) continue;
    if (!nodeIds.has(semanticEdge.from) || !nodeIds.has(semanticEdge.to)) continue;

    const mergedEdge = graphEdgeFromSemanticEdge(semanticEdge);
    const key = graphEdgeKey(mergedEdge);
    const existing = edgesByKey.get(key);
    if (existing) {
      const existingIndex = nextEdges.findIndex((edge) => edge.id === existing.id);
      const nextExisting = mergeSemanticMetadata(existing, semanticEdge);
      edgesByKey.set(key, nextExisting);
      if (existingIndex !== -1) nextEdges[existingIndex] = nextExisting;
      continue;
    }

    edgesByKey.set(key, mergedEdge);
    nextEdges.push(mergedEdge);
  }

  return {
    ...args.graph,
    edges: nextEdges
  };
}

function shouldIncludeSemanticEdge(
  status: SemanticGraphEdgeStatus,
  includeSemantic: SemanticGraphIncludeMode,
  includeSemanticProposals: boolean
): boolean {
  if (status === "accepted" || status === "auto-accepted") return includeSemantic === "accepted" || includeSemantic === "all";
  if (status === "proposed") return includeSemantic === "all" || includeSemanticProposals;
  return false;
}

function graphEdgeFromSemanticEdge(edge: SemanticGraphEdge): GraphEdge {
  return {
    id: `semantic:${edge.id}`,
    projectId: edge.projectId,
    from: edge.from,
    to: edge.to,
    type: edge.type,
    reason: edge.reason,
    sourceKind: "semantic",
    semanticEdgeId: edge.id,
    semanticStatus: edge.status,
    confidence: edge.confidence,
    evidence: edge.evidence
  };
}

function mergeSemanticMetadata(edge: GraphEdge, semanticEdge: SemanticGraphEdge): GraphEdge {
  return {
    ...edge,
    reason: edge.reason.includes(semanticEdge.reason)
      ? edge.reason
      : `${edge.reason} Semantic evidence: ${semanticEdge.reason}`,
    sourceKind: edge.sourceKind === "semantic" ? "semantic" : "deterministic+semantic",
    semanticEdgeId: semanticEdge.id,
    semanticStatus: semanticEdge.status,
    confidence: Math.max(edge.confidence || 0, semanticEdge.confidence),
    evidence: mergeSemanticEvidence(edge.evidence || [], semanticEdge.evidence)
  };
}

function mergeSemanticEvidence(
  left: NonNullable<GraphEdge["evidence"]>,
  right: NonNullable<GraphEdge["evidence"]>
): NonNullable<GraphEdge["evidence"]> {
  const byKey = new Map<string, NonNullable<GraphEdge["evidence"]>[number]>();
  for (const item of [...left, ...right]) {
    byKey.set(`${item.documentId || ""}\u0000${item.quote}\u0000${item.location || ""}\u0000${item.sourcePath || ""}`, item);
  }
  return [...byKey.values()];
}

function graphEdgeKey(edge: Pick<GraphEdge, "from" | "to" | "type">): string {
  return `${edge.from}\u0000${edge.to}\u0000${edge.type}`;
}
