import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from "d3";
import { graphDocumentIdForGraphNode, isGraphFocusableNodeId } from "./graph-selection.js";
import { graphNodeVisualKind, type GraphMapEdge, type GraphMapNode } from "./graph-flow-model.js";
import { graphMapNodeLabel, graphNodeRadius, graphNodeVisualStyle } from "./graph-map-style.js";
import {
  createGraphLayoutPlan,
  deterministicGraphPosition,
  fallbackGraphPosition
} from "../../features/graph/layout/graph-layout-adapter.js";
import type { StoredGraphNodePositionMap } from "../../features/graph/persistence/graph-position-store.js";

const GRAPH_SIMULATION_TICKS = 220;

export interface D3GraphNode extends SimulationNodeDatum {
  id: string;
  type: string;
  typeLabel: string;
  label: string;
  metadata: string;
  graphNode: GraphMapNode["graphNode"];
  radius: number;
  degree: number;
  fillColor: string;
  accentColor: string;
  textColor: string;
  isAnchor: boolean;
  isRoot: boolean;
  documentId: string;
  focusable: boolean;
  targetX: number;
  targetY: number;
}

export interface D3GraphLink extends SimulationLinkDatum<D3GraphNode> {
  id: string;
  source: string | D3GraphNode;
  target: string | D3GraphNode;
  type: GraphMapEdge["type"];
  color: string;
  label: string;
  reason: string;
  sourceKind?: GraphMapEdge["sourceKind"];
  semanticStatus?: GraphMapEdge["semanticStatus"];
  confidence?: number;
  evidence?: GraphMapEdge["evidence"];
  graphEdge: GraphMapEdge;
}

export interface D3GraphModel {
  nodes: D3GraphNode[];
  links: D3GraphLink[];
  markerIdByColor: Map<string, string>;
}

export function buildD3GraphModel(
  {
    nodes,
    edges,
    focusedNodeId,
    storedPositions
  }: {
    nodes: readonly GraphMapNode[];
    edges: readonly GraphMapEdge[];
    focusedNodeId: string;
    storedPositions?: StoredGraphNodePositionMap;
  }
): D3GraphModel {
  const layout = createGraphLayoutPlan(nodes, edges, focusedNodeId);
  const degreeByNodeId = layout.degreeByNodeId;
  const targetPositions = layout.positions;

  const graphNodes = nodes.map((node, index): D3GraphNode => {
    const type = String(node.type || "node");
    const visualType = graphNodeVisualKind(node);
    const degree = degreeByNodeId.get(node.id) || 0;
    const isRoot = node.id === focusedNodeId || (!focusedNodeId && type === "project");
    const colors = graphNodeVisualStyle(visualType, node);
    const target = targetPositions.get(node.id) || fallbackGraphPosition(index, nodes.length);
    const storedPosition = storedPositions?.[node.id];
    const position = storedPosition || deterministicGraphPosition(target, node.id);

    return {
      id: node.id,
      type,
      typeLabel: node.typeLabel,
      label: graphMapNodeLabel(node),
      metadata: node.metadata,
      graphNode: node.graphNode,
      radius: graphNodeRadius(type, degree, isRoot),
      degree,
      fillColor: colors.fill,
      accentColor: colors.accent,
      textColor: colors.text,
      isAnchor: node.isAnchor,
      isRoot,
      documentId: graphDocumentIdForGraphNode(node.id, node.graphNode) || "",
      focusable: isGraphFocusableNodeId(node.id),
      targetX: target.x,
      targetY: target.y,
      x: position.x,
      y: position.y
    };
  });

  const graphNodeById = new Map(graphNodes.map((node) => [node.id, node]));
  const nodeIdSet = new Set(graphNodeById.keys());
  const graphLinks = edges
    .filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
    .map((edge): D3GraphLink => ({
      id: edge.id,
      source: graphNodeById.get(edge.source) || edge.source,
      target: graphNodeById.get(edge.target) || edge.target,
      type: edge.type,
      color: edge.color || "#b87333",
      label: edge.label || "",
      reason: edge.reason,
      sourceKind: edge.sourceKind,
      semanticStatus: edge.semanticStatus,
      confidence: edge.confidence,
      evidence: edge.evidence,
      graphEdge: edge
    }));

  if (!storedPositions) {
    runGraphSimulation(graphNodes, graphLinks);
  }

  const markerIdByColor = new Map<string, string>();
  for (const color of new Set(graphLinks.map((link) => link.color || "#b87333"))) {
    markerIdByColor.set(color, `graph-arrow-${markerIdByColor.size}`);
  }

  return {
    nodes: graphNodes,
    links: graphLinks,
    markerIdByColor
  };
}

function runGraphSimulation(nodes: D3GraphNode[], links: D3GraphLink[]): void {
  const simulation = forceSimulation<D3GraphNode>(nodes)
    .force("link", forceLink<D3GraphNode, D3GraphLink>(links)
      .id((node) => node.id)
      .distance((link) => graphLinkDistance(link))
      .strength((link) => link.type === "contains" ? 0.045 : 0.035))
    .force("charge", forceManyBody<D3GraphNode>().strength((node) => node.isRoot ? -320 : -220))
    .force("collide", forceCollide<D3GraphNode>().radius((node) => node.radius + 24).strength(0.98).iterations(4))
    .force("x", forceX<D3GraphNode>((node) => node.targetX).strength((node) => node.isRoot ? 0.72 : 0.58))
    .force("y", forceY<D3GraphNode>((node) => node.targetY).strength((node) => node.isRoot ? 0.72 : 0.58))
    .stop();

  for (let tick = 0; tick < GRAPH_SIMULATION_TICKS; tick += 1) {
    simulation.tick();
  }

  for (const node of nodes) {
    node.x = Math.round(Number(node.x || 0));
    node.y = Math.round(Number(node.y || 0));
  }
}

function graphLinkDistance(link: D3GraphLink): number {
  if (link.type === "contains") return 185;
  if (link.type === "depends-on") return 230;
  return 205;
}
