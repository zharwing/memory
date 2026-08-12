export interface GraphLayoutNode {
  id: string;
  type: string;
  label: string;
}

export interface GraphLayoutEdge {
  source: string;
  target: string;
}

export interface GraphNodePosition {
  x: number;
  y: number;
}

export interface GraphLayoutPlan {
  degreeByNodeId: ReadonlyMap<string, number>;
  positions: ReadonlyMap<string, GraphNodePosition>;
}

const LAYOUT_RANKS: Readonly<Record<string, number>> = {
  project: 900,
  repo: 760,
  workstream: 740,
  topic: 620,
  service: 540,
  package: 530,
  "diagram-group": 520,
  "code-area": 500,
  task: 450,
  session: 340,
  diagram: 320,
  decision: 300,
  doc: 280,
  command: 260,
  gotcha: 250,
  file: 220,
  "external-reference": 210
};

/** Pure, deterministic layout input adapter. D3 only refines these targets. */
export function createGraphLayoutPlan(
  nodes: readonly GraphLayoutNode[],
  edges: readonly GraphLayoutEdge[],
  focusedNodeId: string
): GraphLayoutPlan {
  const degreeByNodeId = graphDegreeByNodeId(nodes, edges);
  const positions = focusedNodeId && nodes.some((node) => node.id === focusedNodeId)
    ? focusedLayout(nodes, edges, focusedNodeId, degreeByNodeId)
    : overviewLayout(nodes, degreeByNodeId);
  return { degreeByNodeId, positions };
}

export function fallbackGraphPosition(index: number, total: number): GraphNodePosition {
  if (total <= 1) return { x: 0, y: 0 };
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  const radius = 340 + Math.floor(index / 20) * 220;
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius)
  };
}

export function deterministicGraphPosition(position: GraphNodePosition, nodeId: string): GraphNodePosition {
  const hash = stableHash(nodeId);
  return {
    x: position.x + ((hash % 23) - 11),
    y: position.y + (((hash >> 5) % 23) - 11)
  };
}

export function nextGraphKeyboardNodeId(
  nodes: readonly GraphLayoutNode[],
  activeNodeId: string,
  command: "first" | "last" | "next" | "previous"
): string | undefined {
  if (!nodes.length) return undefined;
  if (command === "first") return nodes[0].id;
  if (command === "last") return nodes[nodes.length - 1].id;
  const currentIndex = Math.max(0, nodes.findIndex((node) => node.id === activeNodeId));
  const offset = command === "next" ? 1 : -1;
  const nextIndex = (currentIndex + offset + nodes.length) % nodes.length;
  return nodes[nextIndex].id;
}

function focusedLayout(
  nodes: readonly GraphLayoutNode[],
  edges: readonly GraphLayoutEdge[],
  focusedNodeId: string,
  degreeByNodeId: ReadonlyMap<string, number>
): Map<string, GraphNodePosition> {
  const positions = new Map<string, GraphNodePosition>([[focusedNodeId, { x: 0, y: 0 }]]);
  const adjacency = adjacencyByNodeId(nodes, edges);
  const visited = new Set<string>([focusedNodeId]);
  let frontier = [focusedNodeId];
  let ring = 1;

  while (frontier.length) {
    const nextIds = new Set<string>();
    for (const nodeId of frontier) {
      for (const neighborId of adjacency.get(nodeId) ?? []) {
        if (!visited.has(neighborId)) nextIds.add(neighborId);
      }
    }
    const nextNodes = sortLayoutNodes(
      nodes.filter((node) => nextIds.has(node.id)),
      degreeByNodeId
    );
    if (!nextNodes.length) break;
    placeAcrossRings(nextNodes.map((node) => node.id), 250 + (ring - 1) * 205, 178, -Math.PI / 2 + ring * 0.19, positions);
    for (const node of nextNodes) visited.add(node.id);
    frontier = nextNodes.map((node) => node.id);
    ring += Math.max(1, Math.ceil(nextNodes.length / 18));
  }

  const remaining = sortLayoutNodes(nodes.filter((node) => !visited.has(node.id)), degreeByNodeId);
  placeAcrossRings(remaining.map((node) => node.id), 250 + ring * 205, 190, Math.PI * 0.12, positions);
  return positions;
}

function overviewLayout(
  nodes: readonly GraphLayoutNode[],
  degreeByNodeId: ReadonlyMap<string, number>
): Map<string, GraphNodePosition> {
  const positions = new Map<string, GraphNodePosition>();
  const sorted = sortLayoutNodes(nodes, degreeByNodeId);
  const tiers = [
    sorted.filter((node) => node.type === "project"),
    sorted.filter((node) => node.type !== "project" && ["repo", "workstream"].includes(node.type)),
    sorted.filter((node) => ["topic", "service", "package", "diagram-group", "code-area", "task", "session"].includes(node.type)),
    sorted.filter((node) => !["project", "repo", "workstream", "topic", "service", "package", "diagram-group", "code-area", "task", "session"].includes(node.type))
  ];
  const baseRadii = [0, 340, 660, 980];
  tiers.forEach((tier, index) => placeAcrossRings(tier.map((node) => node.id), baseRadii[index], 260, -Math.PI / 2 + index * 0.17, positions));
  return positions;
}

function graphDegreeByNodeId(
  nodes: readonly GraphLayoutNode[],
  edges: readonly GraphLayoutEdge[]
): Map<string, number> {
  const degree = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (degree.has(edge.source)) degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    if (degree.has(edge.target)) degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}

function adjacencyByNodeId(
  nodes: readonly GraphLayoutNode[],
  edges: readonly GraphLayoutEdge[]
): Map<string, Set<string>> {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) {
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) {
      adjacency.get(edge.source)!.add(edge.target);
      adjacency.get(edge.target)!.add(edge.source);
    }
  }
  return adjacency;
}

function sortLayoutNodes(
  nodes: readonly GraphLayoutNode[],
  degreeByNodeId: ReadonlyMap<string, number>
): GraphLayoutNode[] {
  return [...nodes].sort((left, right) => {
    const leftWeight = (LAYOUT_RANKS[left.type] ?? 240) + Math.min((degreeByNodeId.get(left.id) ?? 0) * 8, 120);
    const rightWeight = (LAYOUT_RANKS[right.type] ?? 240) + Math.min((degreeByNodeId.get(right.id) ?? 0) * 8, 120);
    return rightWeight - leftWeight || left.label.localeCompare(right.label, "en-US") || left.id.localeCompare(right.id, "en-US");
  });
}

function placeAcrossRings(
  nodeIds: readonly string[],
  baseRadius: number,
  ringGap: number,
  startAngle: number,
  positions: Map<string, GraphNodePosition>
): void {
  if (!nodeIds.length) return;
  if (baseRadius === 0) {
    nodeIds.forEach((nodeId, index) => positions.set(nodeId, index === 0 ? { x: 0, y: 0 } : fallbackGraphPosition(index, nodeIds.length)));
    return;
  }
  let consumed = 0;
  let ringIndex = 0;
  while (consumed < nodeIds.length) {
    const radius = baseRadius + ringIndex * ringGap;
    const capacity = Math.max(7, Math.floor((Math.PI * 2 * radius) / 175));
    const count = Math.min(capacity, nodeIds.length - consumed);
    for (let index = 0; index < count; index += 1) {
      const angle = startAngle + ringIndex * 0.23 + (Math.PI * 2 * index) / count;
      positions.set(nodeIds[consumed + index], {
        x: Math.round(Math.cos(angle) * radius),
        y: Math.round(Math.sin(angle) * radius)
      });
    }
    consumed += count;
    ringIndex += 1;
  }
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
