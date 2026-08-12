export interface VirtualGraphNode {
  id: string;
  type: string;
  label: string;
  isAnchor?: boolean;
}

export interface VirtualGraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  sourceKind?: string;
}

export interface GraphRenderBudget {
  maximumNodes: number;
  maximumEdges: number;
}

export interface VirtualizedGraph<Node extends VirtualGraphNode, Edge extends VirtualGraphEdge> {
  nodes: Node[];
  edges: Edge[];
  omittedNodeCount: number;
  omittedEdgeCount: number;
  limited: boolean;
}

export const DEFAULT_GRAPH_RENDER_BUDGET: GraphRenderBudget = {
  maximumNodes: 180,
  maximumEdges: 540
};

/**
 * Bounds DOM/SVG work without making array order a product policy. Focus,
 * anchors, semantic relationships, degree, labels, and IDs determine a stable
 * projection. The structured and visual adapters consume the same result.
 */
export function virtualizeGraph<Node extends VirtualGraphNode, Edge extends VirtualGraphEdge>(
  nodes: readonly Node[],
  edges: readonly Edge[],
  focusedNodeId: string,
  budget: GraphRenderBudget = DEFAULT_GRAPH_RENDER_BUDGET
): VirtualizedGraph<Node, Edge> {
  const maximumNodes = boundedBudget(budget.maximumNodes, 1, 500);
  const maximumEdges = boundedBudget(budget.maximumEdges, 0, 1_500);
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  const semanticNodeIds = new Set<string>();

  for (const edge of edges) {
    if (degree.has(edge.source)) degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    if (degree.has(edge.target)) degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    if (edge.sourceKind?.includes("semantic")) {
      semanticNodeIds.add(edge.source);
      semanticNodeIds.add(edge.target);
    }
  }

  const selectedNodes = [...nodes]
    .sort((left, right) => {
      const leftPriority = nodePriority(left, focusedNodeId, semanticNodeIds, degree);
      const rightPriority = nodePriority(right, focusedNodeId, semanticNodeIds, degree);
      return rightPriority - leftPriority ||
        left.label.localeCompare(right.label, "en-US") ||
        left.id.localeCompare(right.id, "en-US");
    })
    .slice(0, maximumNodes);
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));

  const eligibleEdges = edges.filter((edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target));
  const selectedEdges = [...eligibleEdges]
    .sort((left, right) => {
      const leftPriority = edgePriority(left, focusedNodeId);
      const rightPriority = edgePriority(right, focusedNodeId);
      return rightPriority - leftPriority || left.id.localeCompare(right.id, "en-US");
    })
    .slice(0, maximumEdges);

  return {
    nodes: selectedNodes,
    edges: selectedEdges,
    omittedNodeCount: Math.max(0, nodes.length - selectedNodes.length),
    omittedEdgeCount: Math.max(0, edges.length - selectedEdges.length),
    limited: selectedNodes.length < nodes.length || selectedEdges.length < edges.length
  };
}

function nodePriority(
  node: VirtualGraphNode,
  focusedNodeId: string,
  semanticNodeIds: ReadonlySet<string>,
  degree: ReadonlyMap<string, number>
): number {
  if (node.id === focusedNodeId) return 100_000;
  const typePriority: Readonly<Record<string, number>> = {
    project: 90_000,
    repo: 80_000,
    workstream: 75_000,
    topic: 60_000,
    service: 55_000,
    package: 54_000,
    "diagram-group": 53_000,
    "code-area": 52_000
  };
  return (node.isAnchor ? 70_000 : typePriority[node.type] ?? 10_000) +
    (semanticNodeIds.has(node.id) ? 8_000 : 0) +
    Math.min((degree.get(node.id) ?? 0) * 100, 7_000);
}

function edgePriority(edge: VirtualGraphEdge, focusedNodeId: string): number {
  const touchesFocus = edge.source === focusedNodeId || edge.target === focusedNodeId;
  const semantic = edge.sourceKind?.includes("semantic") ?? false;
  const typePriority = edge.type === "contains" ? 300 : edge.type === "belongs-to" ? 100 : 200;
  return (touchesFocus ? 10_000 : 0) + (semantic ? 2_000 : 0) + typePriority;
}

function boundedBudget(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}
