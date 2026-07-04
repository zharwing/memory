import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import { Maximize2, Minus, Plus } from "lucide-react";
import { graphDocumentIdForGraphNode, isGraphFocusableNodeId } from "./graph-display.js";
import type { GraphMapEdge, GraphMapNode } from "./graph-flow.js";

const GRAPH_MIN_ZOOM = 0.12;
const GRAPH_MAX_ZOOM = 12;
const GRAPH_WHEEL_SENSITIVITY = 1.05;
const GRAPH_ZOOM_IN_FACTOR = 2;
const GRAPH_ZOOM_OUT_FACTOR = 0.5;
const GRAPH_POSITION_FORMAT_VERSION = 2;
const FOCUSED_PRIMARY_X = 420;
const FOCUSED_SECONDARY_X = 760;
const FOCUSED_ROOT_X = 840;
const FOCUSED_SECONDARY_ROOT_X = 1120;
const FOCUSED_RING_GAP = 280;
const FOCUSED_ROOT_LANE_GAP = 360;
const FOCUSED_NODE_LANE_GAP = 260;

type GraphNodePosition = { x: number; y: number };
type StoredGraphNodePositionMap = Record<string, GraphNodePosition>;

interface StoredGraphNodePositionsPayload {
  version: number;
  nodeIds: string[];
  positions: StoredGraphNodePositionMap;
}

interface GraphMapProps {
  nodes: GraphMapNode[];
  edges: GraphMapEdge[];
  focusedNodeId: string;
  storageKey: string;
  layoutVersion: number;
  onOpenDocument: (documentId: string) => void;
  onFocusNode: (nodeId: string) => void;
}

export function GraphMap({
  nodes,
  edges,
  focusedNodeId,
  storageKey,
  layoutVersion,
  onOpenDocument,
  onFocusNode
}: GraphMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onOpenDocumentRef = useRef(onOpenDocument);
  const onFocusNodeRef = useRef(onFocusNode);

  useEffect(() => {
    onOpenDocumentRef.current = onOpenDocument;
  }, [onOpenDocument]);

  useEffect(() => {
    onFocusNodeRef.current = onFocusNode;
  }, [onFocusNode]);

  const graphModel = useMemo(() => {
    const storedPositions = readStoredGraphNodePositions(storageKey, nodes);
    const hasStoredPositions = Boolean(storedPositions);
    const focusedPositions = !hasStoredPositions && focusedNodeId ? buildFocusedFanPositions(nodes, edges, focusedNodeId) : undefined;
    const hasPresetPositions = hasStoredPositions || Boolean(focusedPositions);
    const presetPositions = storedPositions || focusedPositions;
    const degreeByNodeId = getGraphDegreeByNodeId(nodes, edges);
    const elements: cytoscape.ElementDefinition[] = [
      ...nodes.map((node, index): cytoscape.ElementDefinition => {
        const graphNode = node.graphNode;
        const type = String(node.type || "node");
        const isRoot = node.id === focusedNodeId || (!focusedNodeId && type === "project");
        const storedPosition = storedPositions?.[node.id];
        const position = storedPosition || focusedPositions?.get(node.id) || (hasPresetPositions ? fallbackGraphPosition(index, nodes.length) : undefined);
        const degree = degreeByNodeId.get(node.id) || 0;
        const documentId = graphDocumentIdForGraphNode(node.id, graphNode);
        const colors = graphNodeColors(type);

        return {
          group: "nodes",
          data: {
            id: node.id,
            label: truncateGraphLabel(graphMapNodeLabel(node)),
            fullLabel: node.label,
            metadata: node.metadata,
            type,
            typeLabel: node.typeLabel,
            documentId,
            focusable: isGraphFocusableNodeId(node.id),
            isRoot,
            isAnchor: node.isAnchor,
            degree,
            layoutWeight: graphLayoutWeight(type, degree, isRoot),
            size: graphNodeSize(type, degree, isRoot),
            fillColor: colors.fill,
            accentColor: colors.accent,
            textColor: colors.text
          },
          position
        };
      }),
      ...edges.map((edge): cytoscape.ElementDefinition => ({
        group: "edges",
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          label: edge.label || "",
          color: edge.color,
          reason: edge.reason
        }
      }))
    ];

    return {
      elements,
      hasPresetPositions,
      presetPositions
    };
  }, [edges, focusedNodeId, layoutVersion, nodes, storageKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cy = cytoscape({
      container,
      elements: graphModel.elements,
      style: GRAPH_MAP_STYLE,
      minZoom: GRAPH_MIN_ZOOM,
      maxZoom: GRAPH_MAX_ZOOM,
      wheelSensitivity: GRAPH_WHEEL_SENSITIVITY,
      boxSelectionEnabled: false,
      autoungrabify: false
    });
    cyRef.current = cy;

    cy.on("tap", "node", (event) => {
      const node = event.target as cytoscape.NodeSingular;
      const documentId = String(node.data("documentId") || "");
      if (documentId) {
        onOpenDocumentRef.current(documentId);
        return;
      }

      if (node.data("focusable")) {
        onFocusNodeRef.current(node.id());
      }
    });

    cy.on("dragfree", "node", () => {
      saveGraphNodePositions(storageKey, cy);
    });

    const resizeObserver = new ResizeObserver(() => {
      cy.resize();
    });
    resizeObserver.observe(container);

    const layout = cy.layout(createGraphLayout({
      hasPresetPositions: graphModel.hasPresetPositions
    }));
    layout.run();
    applyGraphPresetPositions(cy, graphModel.presetPositions);
    const presetFrame = requestAnimationFrame(() => {
      applyGraphPresetPositions(cy, graphModel.presetPositions);
    });

    return () => {
      cancelAnimationFrame(presetFrame);
      resizeObserver.disconnect();
      cy.destroy();
      if (cyRef.current === cy) cyRef.current = null;
    };
  }, [focusedNodeId, graphModel, storageKey]);

  return (
    <div className="graph-map-shell">
      <div className="graph-map" ref={containerRef} />
      <div className="graph-map-controls" aria-label="Graph controls">
        <button type="button" onClick={() => zoomGraph(cyRef.current, GRAPH_ZOOM_IN_FACTOR)} title="Zoom in" aria-label="Zoom in">
          <Plus size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => zoomGraph(cyRef.current, GRAPH_ZOOM_OUT_FACTOR)} title="Zoom out" aria-label="Zoom out">
          <Minus size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => fitGraph(cyRef.current)} title="Fit graph" aria-label="Fit graph">
          <Maximize2 size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function removeStoredGraphNodePositions(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // No-op when browser storage is unavailable.
  }
}

function createGraphLayout(args: { hasPresetPositions: boolean }): cytoscape.LayoutOptions {
  if (args.hasPresetPositions) {
    return {
      name: "preset",
      fit: true,
      padding: 64,
      animate: false
    };
  }

  return {
    name: "concentric",
    fit: true,
    padding: 76,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
    minNodeSpacing: 34,
    spacingFactor: 1.18,
    equidistant: false,
    animate: false,
    startAngle: -Math.PI / 2,
    concentric: (node) => Number(node.data("layoutWeight") || 0),
    levelWidth: () => 160
  };
}

function applyGraphPresetPositions(
  cy: cytoscape.Core,
  presetPositions: Map<string, GraphNodePosition> | StoredGraphNodePositionMap | undefined
): void {
  if (!presetPositions) return;

  const readPosition = presetPositions instanceof Map
    ? (nodeId: string) => presetPositions.get(nodeId)
    : (nodeId: string) => presetPositions[nodeId];

  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const position = readPosition(node.id());
      if (position) node.position(position);
    });
  });
  cy.fit(undefined, 64);
}

const GRAPH_MAP_STYLE = [
  {
    selector: "core",
    style: {
      "active-bg-color": "#c0702d",
      "active-bg-opacity": 0.08,
      "selection-box-color": "#c0702d",
      "selection-box-opacity": 0.08,
      "selection-box-border-color": "#c0702d"
    }
  },
  {
    selector: "node",
    style: {
      width: "data(size)",
      height: "data(size)",
      "background-color": "data(fillColor)",
      "border-color": "data(accentColor)",
      "border-width": 2,
      "border-opacity": 0.95,
      label: "data(label)",
      color: "data(textColor)",
      "font-family": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "font-size": 10,
      "font-weight": 700,
      "line-height": 1.08,
      "text-halign": "center",
      "text-valign": "center",
      "text-wrap": "wrap",
      "text-max-width": 92,
      "text-events": "yes",
      "text-outline-color": "data(fillColor)",
      "text-outline-width": 2,
      "overlay-color": "data(accentColor)",
      "overlay-opacity": 0,
      "transition-property": "border-width, border-color, background-color, opacity",
      "transition-duration": 120
    }
  },
  {
    selector: "node[isAnchor]",
    style: {
      "font-size": 11,
      "font-weight": 800,
      "text-max-width": 112
    }
  },
  {
    selector: "node[isRoot]",
    style: {
      "border-width": 5,
      "font-size": 12,
      "text-max-width": 126,
      "shadow-blur": 18,
      "shadow-color": "data(accentColor)",
      "shadow-opacity": 0.2,
      "shadow-offset-x": 0,
      "shadow-offset-y": 8
    }
  },
  {
    selector: "node:selected",
    style: {
      "border-width": 5,
      "overlay-opacity": 0.1
    }
  },
  {
    selector: "edge",
    style: {
      width: 1.65,
      "line-color": "data(color)",
      "target-arrow-color": "data(color)",
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.82,
      "curve-style": "bezier",
      opacity: 0.64
    }
  },
  {
    selector: "edge[type = 'contains']",
    style: {
      width: 2.1,
      opacity: 0.72
    }
  },
  {
    selector: "edge:selected",
    style: {
      width: 2.6,
      opacity: 0.92
    }
  }
] as cytoscape.StylesheetJson;

function getGraphDegreeByNodeId(nodes: GraphMapNode[], edges: GraphMapEdge[]): Map<string, number> {
  const degree = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  return degree;
}

function buildFocusedFanPositions(nodes: GraphMapNode[], edges: GraphMapEdge[], focusedNodeId: string): Map<string, GraphNodePosition> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const positions = new Map<string, { x: number; y: number }>();
  if (!nodeById.has(focusedNodeId)) return positions;

  positions.set(focusedNodeId, { x: 0, y: 0 });
  const assignedNodeIds = new Set<string>([focusedNodeId]);
  const incomingNodeIds = new Set<string>();
  const outgoingNodeIds = new Set<string>();

  for (const edge of edges) {
    if (edge.target === focusedNodeId && edge.source !== focusedNodeId && nodeById.has(edge.source)) {
      incomingNodeIds.add(edge.source);
    }
    if (edge.source === focusedNodeId && edge.target !== focusedNodeId && nodeById.has(edge.target)) {
      outgoingNodeIds.add(edge.target);
    }
  }

  const incomingGroups = splitFocusedRootNodes([...incomingNodeIds], nodeById);
  const outgoingGroups = splitFocusedRootNodes([...outgoingNodeIds].filter((nodeId) => !incomingNodeIds.has(nodeId)), nodeById);
  for (const nodeId of [...incomingGroups.roots, ...incomingGroups.others, ...outgoingGroups.roots, ...outgoingGroups.others]) {
    assignedNodeIds.add(nodeId);
  }

  const secondaryIncomingRootNodes: string[] = [];
  const secondaryIncomingNodes: string[] = [];
  const secondaryOutgoingRootNodes: string[] = [];
  const secondaryOutgoingNodes: string[] = [];
  const orbitNodes: string[] = [];

  for (const node of nodes) {
    if (assignedNodeIds.has(node.id)) continue;

    const relationship = getFocusedSecondaryRelationship(node.id, edges, incomingNodeIds, outgoingNodeIds);
    const isRootNode = isFocusedRootNode(node);
    if (relationship === "incoming") {
      if (isRootNode) secondaryIncomingRootNodes.push(node.id);
      else secondaryIncomingNodes.push(node.id);
    } else if (relationship === "outgoing") {
      if (isRootNode) secondaryOutgoingRootNodes.push(node.id);
      else secondaryOutgoingNodes.push(node.id);
    } else {
      orbitNodes.push(node.id);
    }
    assignedNodeIds.add(node.id);
  }

  placeFocusedRootLane(incomingGroups.roots, -1, FOCUSED_ROOT_X, positions, nodeById);
  placeFocusedColumn(incomingGroups.others, -1, FOCUSED_PRIMARY_X, positions, nodeById);
  placeFocusedRootLane(outgoingGroups.roots, 1, FOCUSED_ROOT_X, positions, nodeById);
  placeFocusedColumn(outgoingGroups.others, 1, FOCUSED_PRIMARY_X, positions, nodeById);
  placeFocusedRootLane(secondaryIncomingRootNodes, -1, FOCUSED_SECONDARY_ROOT_X, positions, nodeById);
  placeFocusedColumn(secondaryIncomingNodes, -1, FOCUSED_SECONDARY_X, positions, nodeById);
  placeFocusedRootLane(secondaryOutgoingRootNodes, 1, FOCUSED_SECONDARY_ROOT_X, positions, nodeById);
  placeFocusedColumn(secondaryOutgoingNodes, 1, FOCUSED_SECONDARY_X, positions, nodeById);
  placeFocusedOrbit(orbitNodes, positions, nodeById);

  return positions;
}

function splitFocusedRootNodes(
  nodeIds: string[],
  nodeById: Map<string, GraphMapNode>
): { roots: string[]; others: string[] } {
  const roots: string[] = [];
  const others: string[] = [];
  for (const nodeId of nodeIds) {
    const node = nodeById.get(nodeId);
    if (node && isFocusedRootNode(node)) roots.push(nodeId);
    else others.push(nodeId);
  }
  return { roots, others };
}

function isFocusedRootNode(node: GraphMapNode): boolean {
  return ["project", "repo", "workstream"].includes(String(node.type || ""));
}

function placeFocusedRootLane(
  nodeIds: string[],
  side: -1 | 1,
  xDistance: number,
  positions: Map<string, GraphNodePosition>,
  nodeById: Map<string, GraphMapNode>
): void {
  const sortedNodeIds = sortFocusedLayoutNodeIds(nodeIds, nodeById);
  if (!sortedNodeIds.length) return;

  sortedNodeIds.forEach((nodeId, index) => {
    positions.set(nodeId, {
      x: side * xDistance,
      y: focusedLaneY(index, FOCUSED_ROOT_LANE_GAP)
    });
  });
}

function placeFocusedColumn(
  nodeIds: string[],
  side: -1 | 1,
  xDistance: number,
  positions: Map<string, GraphNodePosition>,
  nodeById: Map<string, GraphMapNode>
): void {
  const sortedNodeIds = sortFocusedLayoutNodeIds(nodeIds, nodeById);
  if (!sortedNodeIds.length) return;

  sortedNodeIds.forEach((nodeId, index) => {
    positions.set(nodeId, {
      x: side * xDistance,
      y: focusedLaneY(index, FOCUSED_NODE_LANE_GAP)
    });
  });
}

function focusedLaneY(index: number, gap: number): number {
  const lane = Math.floor(index / 2) + 1;
  const direction = index % 2 === 0 ? -1 : 1;
  return direction * lane * gap;
}

function getFocusedSecondaryRelationship(
  nodeId: string,
  edges: GraphMapEdge[],
  incomingNodeIds: Set<string>,
  outgoingNodeIds: Set<string>
): "incoming" | "outgoing" | "orbit" {
  let incomingLinks = 0;
  let outgoingLinks = 0;

  for (const edge of edges) {
    const relatedNodeId = edge.source === nodeId ? edge.target : edge.target === nodeId ? edge.source : "";
    if (!relatedNodeId) continue;
    if (incomingNodeIds.has(relatedNodeId)) incomingLinks += 1;
    if (outgoingNodeIds.has(relatedNodeId)) outgoingLinks += 1;
  }

  if (incomingLinks > outgoingLinks) return "incoming";
  if (outgoingLinks > incomingLinks) return "outgoing";
  return "orbit";
}

function placeFocusedFanGroup(
  nodeIds: string[],
  side: -1 | 1,
  radius: number,
  positions: Map<string, GraphNodePosition>,
  nodeById: Map<string, GraphMapNode>
): void {
  const sortedNodeIds = sortFocusedLayoutNodeIds(nodeIds, nodeById);
  if (!sortedNodeIds.length) return;

  const maxRingItems = 7;
  for (let ringIndex = 0; ringIndex * maxRingItems < sortedNodeIds.length; ringIndex += 1) {
    const ringNodeIds = sortedNodeIds.slice(ringIndex * maxRingItems, (ringIndex + 1) * maxRingItems);
    const ringRadius = radius + ringIndex * FOCUSED_RING_GAP;
    const centerAngle = side === -1 ? Math.PI : 0;
    const spread = Math.min(Math.PI * 0.72, Math.max(Math.PI * 0.32, ringNodeIds.length * 0.24));
    const startAngle = centerAngle - spread / 2;
    const step = ringNodeIds.length <= 1 ? 0 : spread / (ringNodeIds.length - 1);
    const lineAvoidanceAngle = ringNodeIds.length % 2 === 1 ? 0.32 * side : 0;

    ringNodeIds.forEach((nodeId, index) => {
      const angle = startAngle + step * index + lineAvoidanceAngle;
      positions.set(nodeId, {
        x: Math.round(Math.cos(angle) * ringRadius),
        y: Math.round(Math.sin(angle) * ringRadius)
      });
    });
  }
}

function placeFocusedOrbit(
  nodeIds: string[],
  positions: Map<string, GraphNodePosition>,
  nodeById: Map<string, GraphMapNode>
): void {
  const sortedNodeIds = sortFocusedLayoutNodeIds(nodeIds, nodeById);
  if (!sortedNodeIds.length) return;

  const radius = Math.max(FOCUSED_SECONDARY_X, 520);
  sortedNodeIds.forEach((nodeId, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / sortedNodeIds.length;
    positions.set(nodeId, {
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius)
    });
  });
}

function sortFocusedLayoutNodeIds(nodeIds: string[], nodeById: Map<string, GraphMapNode>): string[] {
  return [...nodeIds].sort((leftId, rightId) => {
    const left = nodeById.get(leftId);
    const right = nodeById.get(rightId);
    return graphLayoutWeight(String(right?.type || ""), 0, false) - graphLayoutWeight(String(left?.type || ""), 0, false) ||
      String(left?.label || leftId).localeCompare(String(right?.label || rightId));
  });
}

function graphLayoutWeight(type: string, degree: number, isRoot: boolean): number {
  const ranks: Record<string, number> = {
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
  return (isRoot ? 1000 : ranks[type] || 240) + Math.min(degree * 8, 120);
}

function graphNodeSize(type: string, degree: number, isRoot: boolean): number {
  if (isRoot) return 92;
  if (type === "project") return 82;
  if (type === "repo" || type === "workstream") return 72;
  if (type === "topic" || type === "service" || type === "package" || type === "diagram-group" || type === "code-area") {
    return Math.min(74, 56 + degree * 2.2);
  }
  if (type === "task" || type === "session") return Math.min(62, 48 + degree * 1.8);
  return Math.min(54, 42 + degree * 1.4);
}

function graphNodeColors(type: string): { fill: string; accent: string; text: string } {
  const colors: Record<string, { fill: string; accent: string; text: string }> = {
    project: { fill: "#eaf1ff", accent: "#2563eb", text: "#1e3a8a" },
    repo: { fill: "#e5f7fb", accent: "#0891b2", text: "#164e63" },
    workstream: { fill: "#f1ecff", accent: "#7c3aed", text: "#4c1d95" },
    topic: { fill: "#e8f6f3", accent: "#0f766e", text: "#134e4a" },
    service: { fill: "#ffeded", accent: "#dc2626", text: "#7f1d1d" },
    package: { fill: "#f7ebff", accent: "#9333ea", text: "#581c87" },
    "diagram-group": { fill: "#fff4e6", accent: "#f97316", text: "#7c2d12" },
    "code-area": { fill: "#eef2f7", accent: "#64748b", text: "#334155" },
    task: { fill: "#ebf9ef", accent: "#16a34a", text: "#14532d" },
    session: { fill: "#ebf9ef", accent: "#16a34a", text: "#14532d" },
    diagram: { fill: "#fff7df", accent: "#f59e0b", text: "#78350f" },
    decision: { fill: "#f3edff", accent: "#7c3aed", text: "#4c1d95" },
    command: { fill: "#f1f5f9", accent: "#475569", text: "#1e293b" },
    gotcha: { fill: "#fff0f3", accent: "#be123c", text: "#881337" },
    file: { fill: "#f1f5f9", accent: "#64748b", text: "#334155" },
    "external-reference": { fill: "#f1f5f9", accent: "#64748b", text: "#334155" }
  };
  return colors[type] || { fill: "#fff8f1", accent: "#b87333", text: "#5d4030" };
}

function truncateGraphLabel(label: string): string {
  const normalized = label
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length <= 38) return normalized;
  return `${normalized.slice(0, 35).trim()}...`;
}

function graphMapNodeLabel(node: GraphMapNode): string {
  if (node.type === "project") return node.label;
  if (node.type === "repo") return `${node.label}\nrepo`;
  if (node.type === "workstream") return `${node.label}\nworkstream`;
  if (node.type === "topic") return `${node.label}\ntopic`;
  if (node.type === "service") return `${node.label}\nservice`;
  if (node.type === "package") return `${node.label}\npackage`;
  if (node.type === "diagram-group") return node.label.replace(/\s+diagrams$/i, "\ndiagrams");
  if (node.type === "code-area") return `${node.label}\ncode area`;
  return node.label;
}

function fallbackGraphPosition(index: number, total: number): GraphNodePosition {
  if (total <= 1) return { x: 0, y: 0 };
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  const radius = 280 + Math.floor(index / 20) * 180;
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius)
  };
}

function readStoredGraphNodePositions(storageKey: string, nodes: GraphMapNode[]): StoredGraphNodePositionMap | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredGraphNodePositionsPayload>;
    if (!isStoredGraphNodePositionsPayload(parsed)) return undefined;

    const expectedNodeIds = nodes.map((node) => node.id).sort();
    if (!sameStringArray(parsed.nodeIds, expectedNodeIds)) return undefined;
    if (!expectedNodeIds.every((nodeId) => isGraphNodePosition(parsed.positions[nodeId]))) return undefined;

    return parsed.positions;
  } catch {
    return undefined;
  }
}

function saveGraphNodePositions(storageKey: string, cy: cytoscape.Core): void {
  if (typeof window === "undefined") return;
  const positions: StoredGraphNodePositionMap = {};
  const nodeIds: string[] = [];
  cy.nodes().forEach((node) => {
    const position = node.position();
    nodeIds.push(node.id());
    positions[node.id()] = {
      x: Math.round(position.x),
      y: Math.round(position.y)
    };
  });

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      version: GRAPH_POSITION_FORMAT_VERSION,
      nodeIds: nodeIds.sort(),
      positions
    }));
  } catch {
    // Graph dragging still works even when browser storage is unavailable.
  }
}

function isStoredGraphNodePositionsPayload(input: unknown): input is StoredGraphNodePositionsPayload {
  if (!input || typeof input !== "object") return false;
  const candidate = input as Partial<StoredGraphNodePositionsPayload>;
  return candidate.version === GRAPH_POSITION_FORMAT_VERSION &&
    Array.isArray(candidate.nodeIds) &&
    Boolean(candidate.positions) &&
    typeof candidate.positions === "object";
}

function isGraphNodePosition(input: unknown): input is GraphNodePosition {
  if (!input || typeof input !== "object") return false;
  const candidate = input as Partial<GraphNodePosition>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function zoomGraph(cy: cytoscape.Core | null, multiplier: number): void {
  const container = cy?.container();
  if (!cy || !container) return;
  const nextZoom = Math.max(GRAPH_MIN_ZOOM, Math.min(GRAPH_MAX_ZOOM, cy.zoom() * multiplier));
  cy.zoom({
    level: nextZoom,
    renderedPosition: {
      x: container.clientWidth / 2,
      y: container.clientHeight / 2
    }
  });
}

function fitGraph(cy: cytoscape.Core | null): void {
  if (!cy) return;
  cy.fit(undefined, 64);
}
