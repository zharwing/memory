import type { GraphEdge, GraphNode, ProjectGraph } from "@zharwing/memory-core";
import { normalizeGraphSlug } from "./naming.js";

/**
 * Adds deterministic domain relationships that historically had to be
 * reconstructed by the desktop. The projection is pure and idempotent.
 */
export function projectGraphDomainProjection(graph: ProjectGraph): ProjectGraph {
  const repoIdBySlug = repoIdsBySlug(graph.nodes);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeIds = new Set(
    graph.edges.map((edge) => String(edge.id || `${edge.from}->${edge.type}->${edge.to}`))
  );
  const appendedEdges: GraphEdge[] = [];
  const projectId = graph.projectId || graph.nodes[0]?.projectId || "project";

  for (const node of graph.nodes) {
    if (node.type !== "diagram-group") continue;
    const slug = String(node.id || "").slice("diagram-group:".length);
    if (!slug || slug === "system") continue;
    const repoId = repoIdBySlug.get(slug);
    if (!repoId || !nodeIds.has(repoId)) continue;
    const edgeId = `${repoId}->contains->${node.id}`;
    if (edgeIds.has(edgeId)) continue;
    edgeIds.add(edgeId);
    appendedEdges.push({
      id: edgeId,
      projectId,
      from: repoId,
      to: node.id,
      type: "contains",
      reason: "Linked repo owns this diagram collection"
    });
  }

  return appendedEdges.length
    ? { ...graph, edges: [...graph.edges, ...appendedEdges] }
    : graph;
}

function repoIdsBySlug(nodes: readonly GraphNode[]): Map<string, string> {
  const repoIds = new Map<string, string>();
  for (const node of nodes) {
    if (node.type !== "repo") continue;
    for (const value of [node.label, node.path, node.id]) {
      const slug = normalizeGraphSlug(String(value || "").split(/[\\/]/).filter(Boolean).pop());
      if (slug) repoIds.set(slug, String(node.id));
    }
  }
  return repoIds;
}
