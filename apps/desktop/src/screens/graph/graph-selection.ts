import type { GraphEdge, GraphNode } from "@zharwing/memory-core";
import type {
  DisplayGraphNode,
  GraphDisplayModel,
  GraphEdgeSelection,
  GraphFocusOption,
  GraphViewMode
} from "./graph-display-types.js";
import { graphNodeTypeLabel } from "./graph-presentation.js";

const GRAPH_OVERVIEW_HUB_LIMIT = 36;

export function selectGraphEdgesForView(
  edges: GraphEdge[],
  nodes: DisplayGraphNode[],
  viewMode: GraphViewMode,
  focusedNodeId: string
): GraphEdgeSelection {
  if (viewMode === "all") {
    return {
      edges,
      nodeIds: new Set<string>(nodes.map((sourceNode) => sourceNode.id))
    };
  }

  const contextEdges = edges.filter(isContextGraphEdge);
  if (focusedNodeId) {
    const nodeIds = trimFocusedGraphNodeIds(
      nodes,
      graphNeighborhoodNodeIds(
        contextEdges,
        focusedNodeId,
        graphFocusedNeighborhoodDistance(nodes, focusedNodeId)
      ),
      focusedNodeId
    );
    const candidateEdges = contextEdges.filter((sourceEdge) =>
      nodeIds.has(sourceEdge.from) && nodeIds.has(sourceEdge.to)
    );
    const connectedNodeIds = graphNeighborhoodNodeIds(
      candidateEdges,
      focusedNodeId,
      Number.MAX_SAFE_INTEGER
    );
    const selectedEdges = candidateEdges.filter((sourceEdge) =>
      connectedNodeIds.has(sourceEdge.from) && connectedNodeIds.has(sourceEdge.to)
    );
    return { edges: selectedEdges, nodeIds: connectedNodeIds };
  }

  const nodeIds = selectOverviewGraphNodeIds(nodes, contextEdges);
  const selectedEdges = contextEdges.filter((sourceEdge) =>
    nodeIds.has(sourceEdge.from) && nodeIds.has(sourceEdge.to)
  );

  return { edges: selectedEdges, nodeIds };
}

function selectOverviewGraphNodeIds(
  nodes: readonly DisplayGraphNode[],
  contextEdges: readonly GraphEdge[]
): Set<string> {
  const nodeIds = new Set<string>();
  const nodeById = new Map<string, DisplayGraphNode>(
    nodes.map((sourceNode) => [sourceNode.id, sourceNode])
  );
  const degree = graphDegrees(contextEdges);

  for (const sourceNode of nodes) {
    if (isOverviewRootNode(sourceNode)) nodeIds.add(sourceNode.id);
  }

  const contextEntityIds = nodes
    .filter(isOverviewContextEntity)
    .filter((sourceNode) => (degree.get(sourceNode.id) || 0) > 0)
    .sort((left, right) => {
      const leftDegree = degree.get(left.id) || 0;
      const rightDegree = degree.get(right.id) || 0;
      return rightDegree - leftDegree ||
        graphFocusTypeRank(left.type) - graphFocusTypeRank(right.type) ||
        left.label.localeCompare(right.label);
    })
    .slice(0, GRAPH_OVERVIEW_HUB_LIMIT)
    .map((sourceNode) => sourceNode.id);

  for (const nodeId of contextEntityIds) {
    nodeIds.add(nodeId);
    for (const sourceEdge of contextEdges) {
      if (sourceEdge.from === nodeId && isOverviewRootNode(nodeById.get(sourceEdge.to))) {
        nodeIds.add(sourceEdge.to);
      }
      if (sourceEdge.to === nodeId && isOverviewRootNode(nodeById.get(sourceEdge.from))) {
        nodeIds.add(sourceEdge.from);
      }
    }
  }

  for (const sourceEdge of contextEdges) {
    if (!isSemanticGraphEdge(sourceEdge)) continue;
    if (nodeById.has(sourceEdge.from)) nodeIds.add(sourceEdge.from);
    if (nodeById.has(sourceEdge.to)) nodeIds.add(sourceEdge.to);
  }

  return nodeIds;
}

function trimFocusedGraphNodeIds(
  nodes: readonly DisplayGraphNode[],
  nodeIds: ReadonlySet<string>,
  focusedNodeId: string
): Set<string> {
  const nodeById = new Map<string, DisplayGraphNode>(
    nodes.map((sourceNode) => [sourceNode.id, sourceNode])
  );
  const focusedType = nodeById.get(focusedNodeId)?.type || "";
  const leafLimit = graphFocusedLeafLimit(focusedType);
  const anchorLimit = graphFocusedAnchorLimit(focusedType);
  const anchors: string[] = [];
  const leaves: string[] = [];

  for (const nodeId of nodeIds) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    if (nodeId !== focusedNodeId && isBroadGraphTopicNode(node)) continue;
    if (nodeId === focusedNodeId || isGraphAnchorNode(node)) anchors.push(nodeId);
    else leaves.push(nodeId);
  }

  leaves.sort((leftId, rightId) => {
    const left = nodeById.get(leftId);
    const right = nodeById.get(rightId);
    return graphLeafTypeRank(left?.type || "") - graphLeafTypeRank(right?.type || "") ||
      (left?.label || "").localeCompare(right?.label || "");
  });

  const focusedAnchor = anchors.filter((nodeId) => nodeId === focusedNodeId);
  const relatedAnchors = anchors
    .filter((nodeId) => nodeId !== focusedNodeId)
    .sort((leftId, rightId) => {
      const left = nodeById.get(leftId);
      const right = nodeById.get(rightId);
      return graphFocusTypeRank(left?.type || "") - graphFocusTypeRank(right?.type || "") ||
        (left?.label || "").localeCompare(right?.label || "");
    });

  return new Set([
    ...focusedAnchor,
    ...relatedAnchors.slice(0, anchorLimit),
    ...leaves.slice(0, leafLimit)
  ]);
}

export function getGraphFocusOptions(graph: GraphDisplayModel | undefined): GraphFocusOption[] {
  const nodes = graph?.nodes ?? [];
  const edges = (graph?.edges ?? []).filter(isContextGraphEdge);
  const degree = graphDegrees(edges);

  return nodes
    .filter((sourceNode) => isGraphFocusableNode(sourceNode) && (degree.get(sourceNode.id) || 0) > 0)
    .map((sourceNode): GraphFocusOption => ({
      id: sourceNode.id,
      label: `${sourceNode.label} (${graphNodeTypeLabel(sourceNode.type)}, ${degree.get(sourceNode.id) || 0})`,
      type: sourceNode.type,
      degree: degree.get(sourceNode.id) || 0
    }))
    .sort((left, right) =>
      graphFocusTypeRank(left.type) - graphFocusTypeRank(right.type) ||
      right.degree - left.degree ||
      left.label.localeCompare(right.label)
    )
    .slice(0, 90);
}

export function isGraphAnchorNode(
  node: Pick<GraphNode, "type"> | undefined
): boolean {
  return [
    "project",
    "repo",
    "workstream",
    "topic",
    "service",
    "package",
    "diagram-group",
    "code-area",
    "task"
  ].includes(node?.type || "");
}

export function isGraphLeafNode(
  node: Pick<GraphNode, "type"> | undefined
): boolean {
  return [
    "doc",
    "diagram",
    "file",
    "session",
    "decision",
    "command",
    "gotcha",
    "external-reference"
  ].includes(node?.type || "");
}

function isGraphFocusableNode(node: Pick<GraphNode, "id">): boolean {
  return isGraphFocusableNodeId(node.id);
}

/** Prefixes for derived context entities. Focusable nodes add `task:`. */
const CONTEXT_ENTITY_NODE_ID_PREFIXES = [
  "repo:",
  "workstream:",
  "topic:",
  "service:",
  "package:",
  "diagram-group:",
  "code-area:",
  "file:"
] as const;

export function isGraphFocusableNodeId(id: string): boolean {
  return id.startsWith("task:") || isContextEntityNodeId(id);
}

export function graphDocumentIdForGraphNode(
  nodeId: string,
  graphNode: unknown
): string | undefined {
  if (!nodeId.startsWith("doc:")) return undefined;
  if (!["doc", "diagram", "decision", "command", "gotcha"].includes(graphNodeType(graphNode))) {
    return undefined;
  }
  return nodeId.slice("doc:".length);
}

function graphNodeType(input: unknown): string {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return "";
  const type = (input as Record<string, unknown>).type;
  return typeof type === "string" ? type : "";
}

function isContextEntityNodeId(id: string): boolean {
  return CONTEXT_ENTITY_NODE_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function graphNeighborhoodNodeIds(
  edges: readonly GraphEdge[],
  focusedNodeId: string,
  maxDistance: number
): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const visited = new Set<string>([focusedNodeId]);
  const queue: Array<{ id: string; distance: number }> = [{ id: focusedNodeId, distance: 0 }];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current || current.distance >= maxDistance) continue;
    for (const next of adjacency.get(current.id) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push({ id: next, distance: current.distance + 1 });
    }
  }
  return visited;
}

function graphDegrees(edges: readonly GraphEdge[]): Map<string, number> {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }
  return degree;
}

function isContextGraphEdge(edge: GraphEdge): boolean {
  if (edge.type !== "belongs-to") return true;
  return edge.to.startsWith("project:") &&
    (edge.from.startsWith("repo:") || edge.from.startsWith("workstream:"));
}

function isOverviewRootNode(node: DisplayGraphNode | undefined): boolean {
  return node?.type === "project" || node?.type === "repo" || node?.type === "workstream";
}

function isSemanticGraphEdge(edge: GraphEdge): boolean {
  return edge.sourceKind?.includes("semantic") || Boolean(edge.semanticEdgeId || edge.semanticStatus);
}

function isOverviewContextEntity(node: DisplayGraphNode): boolean {
  return [
    "topic",
    "service",
    "package",
    "diagram-group",
    "code-area",
    "task"
  ].includes(node.type);
}

function isBroadGraphTopicNode(node: DisplayGraphNode): boolean {
  return node.id === "topic:backend" || node.id === "topic:frontend" || node.id === "topic:diagrams";
}

function graphFocusTypeRank(type: string): number {
  const ranks: Record<string, number> = {
    service: 0,
    package: 1,
    topic: 2,
    "diagram-group": 3,
    repo: 4,
    workstream: 5,
    task: 6,
    file: 7,
    session: 8,
    doc: 9
  };
  return ranks[type] ?? 20;
}

function graphLeafTypeRank(type: string): number {
  const ranks: Record<string, number> = {
    session: 0,
    decision: 1,
    diagram: 2,
    doc: 3,
    command: 4,
    gotcha: 5,
    file: 6,
    "external-reference": 7
  };
  return ranks[type] ?? 20;
}

function graphFocusedLeafLimit(type: string): number {
  if (type === "project") return 0;
  if (type === "repo") return 24;
  if (type === "topic") return 28;
  if (type === "workstream") return 24;
  if (["service", "package", "diagram-group", "code-area"].includes(type)) return 28;
  return 18;
}

function graphFocusedAnchorLimit(type: string): number {
  if (type === "repo") return 18;
  if (type === "topic") return 24;
  if (["service", "package", "diagram-group", "code-area"].includes(type)) return 12;
  return 18;
}

function graphFocusedNeighborhoodDistance(
  nodes: readonly DisplayGraphNode[],
  focusedNodeId: string
): number {
  const focusedType = nodes.find((node) => node.id === focusedNodeId)?.type || "";
  if (focusedType === "repo" || focusedType === "topic") return 2;
  return 1;
}
