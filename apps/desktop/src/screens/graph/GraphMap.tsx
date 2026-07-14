import { useEffect, useMemo, useRef } from "react";
import {
  drag,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  select,
  zoom,
  zoomIdentity,
  type D3DragEvent,
  type Selection,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
  type ZoomBehavior
} from "d3";
import { Maximize2, Minus, Plus } from "lucide-react";
import { graphDocumentIdForGraphNode, isGraphFocusableNodeId } from "./graph-display.js";
import { graphNodeVisualKind, type GraphMapEdge, type GraphMapNode } from "./graph-flow.js";

const GRAPH_MIN_ZOOM = 0.06;
const GRAPH_MAX_ZOOM = 22;
const GRAPH_ZOOM_IN_FACTOR = 1.7;
const GRAPH_ZOOM_OUT_FACTOR = 1 / 1.7;
const GRAPH_POSITION_FORMAT_VERSION = 3;
const GRAPH_FIT_PADDING = 96;
const GRAPH_SIMULATION_TICKS = 220;
const GRAPH_WORLD_LIMIT = 8000;
const GRAPH_DRAG_CLICK_DISTANCE = 6;

type GraphNodePosition = { x: number; y: number };
type StoredGraphNodePositionMap = Record<string, GraphNodePosition>;

interface StoredGraphNodePositionsPayload {
  version: number;
  nodeIds: string[];
  positions: StoredGraphNodePositionMap;
}

interface D3GraphNode extends SimulationNodeDatum {
  id: string;
  type: string;
  typeLabel: string;
  label: string;
  metadata: string;
  graphNode: any;
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

interface D3GraphLink extends SimulationLinkDatum<D3GraphNode> {
  id: string;
  source: string | D3GraphNode;
  target: string | D3GraphNode;
  type: string;
  color: string;
  label: string;
  reason: string;
  sourceKind: string;
  semanticStatus?: string;
  confidence?: number;
  evidence?: Array<{ quote?: string; documentId?: string; location?: string; sourcePath?: string }>;
  graphEdge: GraphMapEdge;
}

interface D3GraphModel {
  nodes: D3GraphNode[];
  links: D3GraphLink[];
  markerIdByColor: Map<string, string>;
}

interface GraphMapProps {
  nodes: GraphMapNode[];
  edges: GraphMapEdge[];
  focusedNodeId: string;
  storageKey: string;
  layoutVersion: number;
  onOpenDocument: (documentId: string) => void;
  onFocusNode: (nodeId: string) => void;
  onSelectEdge: (edge: GraphMapEdge) => void;
}

interface GraphApi {
  zoomBy: (multiplier: number) => void;
  fit: () => void;
}

export function GraphMap({
  nodes,
  edges,
  focusedNodeId,
  storageKey,
  layoutVersion,
  onOpenDocument,
  onFocusNode,
  onSelectEdge
}: GraphMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphApiRef = useRef<GraphApi | null>(null);
  const onOpenDocumentRef = useRef(onOpenDocument);
  const onFocusNodeRef = useRef(onFocusNode);
  const onSelectEdgeRef = useRef(onSelectEdge);

  useEffect(() => {
    onOpenDocumentRef.current = onOpenDocument;
  }, [onOpenDocument]);

  useEffect(() => {
    onFocusNodeRef.current = onFocusNode;
  }, [onFocusNode]);

  useEffect(() => {
    onSelectEdgeRef.current = onSelectEdge;
  }, [onSelectEdge]);

  const graphModel = useMemo(
    () => buildD3GraphModel(nodes, edges, focusedNodeId, storageKey),
    [edges, focusedNodeId, layoutVersion, nodes, storageKey]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerElement: HTMLDivElement = container;

    select(container).selectAll("*").remove();

    const svg = select(container)
      .append("svg")
      .attr("class", "graph-map-svg")
      .attr("role", "img")
      .attr("aria-label", "Interactive context graph");

    const defs = svg.append("defs");
    for (const [color, markerId] of graphModel.markerIdByColor.entries()) {
      defs.append("marker")
        .attr("id", markerId)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 9)
        .attr("refY", 0)
        .attr("markerWidth", 7)
        .attr("markerHeight", 7)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", color);
    }

    const viewport = svg.append("g").attr("class", "graph-map-viewport");
    const linkLayer = viewport.append("g").attr("class", "graph-map-links");
    const nodeLayer = viewport.append("g").attr("class", "graph-map-nodes");

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM])
      .translateExtent([
        [-GRAPH_WORLD_LIMIT, -GRAPH_WORLD_LIMIT],
        [GRAPH_WORLD_LIMIT, GRAPH_WORLD_LIMIT]
      ])
      .wheelDelta((event) => {
        const modeFactor = event.deltaMode === 1 ? 0.08 : event.deltaMode === 2 ? 0.28 : 0.0032;
        return -event.deltaY * modeFactor;
      })
      .on("zoom", (event) => {
        viewport.attr("transform", event.transform.toString());
      });

    svg.call(zoomBehavior);

    const linkSelection = linkLayer
      .selectAll<SVGPathElement, D3GraphLink>("path")
      .data(graphModel.links)
      .enter()
      .append("path")
      .attr("class", (link) => `graph-map-link graph-map-link-${safeGraphClassName(link.type)}`)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", (link) => graphLinkAccessibleLabel(link).replace(/\n/g, ", "))
      .attr("fill", "none")
      .attr("stroke", (link) => link.color || "#b87333")
      .attr("stroke-width", (link) => link.sourceKind.includes("semantic") ? 3.1 : link.type === "contains" ? 3 : 2.1)
      .attr("stroke-opacity", (link) => link.sourceKind.includes("semantic") ? 0.86 : link.type === "contains" ? 0.78 : 0.64)
      .attr("stroke-dasharray", (link) => link.semanticStatus === "proposed" ? "10 7" : null)
      .style("cursor", "pointer")
      .style("pointer-events", "stroke")
      .attr("marker-end", (link) => {
        const markerId = graphModel.markerIdByColor.get(link.color || "#b87333");
        return markerId ? `url(#${markerId})` : null;
      })
      .on("click", (event, link) => {
        event.stopPropagation();
        onSelectEdgeRef.current(link.graphEdge);
      })
      .on("keydown", (event, link) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelectEdgeRef.current(link.graphEdge);
      });

    linkSelection.append("title")
      .text((link) => graphLinkAccessibleLabel(link));

    const nodeSelection = nodeLayer
      .selectAll<SVGGElement, D3GraphNode>("g")
      .data(graphModel.nodes)
      .enter()
      .append("g")
      .attr("class", (node) => [
        "graph-map-node",
        `graph-map-node-${safeGraphClassName(node.type)}`,
        node.isRoot ? "is-root" : "",
        node.isAnchor ? "is-anchor" : "",
        node.documentId || node.focusable ? "is-actionable" : ""
      ].filter(Boolean).join(" "))
      .attr("tabindex", (node) => node.documentId || node.focusable ? 0 : -1)
      .attr("role", (node) => node.documentId || node.focusable ? "button" : "group")
      .attr("aria-label", (node) => graphNodeAccessibleLabel(node));

    nodeSelection.append("circle")
      .attr("class", "graph-map-node-hitbox")
      .attr("r", (node) => node.radius + 18)
      .attr("fill", "transparent")
      .attr("stroke", "none")
      .style("pointer-events", "all");

    nodeSelection.append("circle")
      .attr("r", (node) => node.radius)
      .attr("fill", (node) => node.fillColor)
      .attr("stroke", (node) => node.accentColor)
      .attr("stroke-width", (node) => node.isRoot ? 6 : 4)
      .attr("stroke-opacity", 0.96);

    nodeSelection.append("title")
      .text((node) => graphNodeAccessibleLabel(node));

    const textSelection = nodeSelection.append("text")
      .attr("class", "graph-map-node-label")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", (node) => node.textColor)
      .attr("paint-order", "stroke")
      .attr("stroke", (node) => node.fillColor)
      .attr("stroke-width", 5)
      .attr("stroke-linejoin", "round")
      .style("font-size", (node) => `${graphNodeFontSize(node)}px`)
      .style("font-weight", (node) => node.isRoot || node.isAnchor ? 800 : 750);

    textSelection.each(function appendWrappedNodeLabel(node) {
      appendWrappedLabel(select(this), node);
    });

    let dragState: { nodeId: string; startX: number; startY: number; moved: boolean } | null = null;
    let pointerClickState: { nodeId: string; pointerId: number; clientX: number; clientY: number; moved: boolean } | null = null;
    let suppressClickNodeId = "";

    const nodeDrag = drag<SVGGElement, D3GraphNode>()
      .clickDistance(GRAPH_DRAG_CLICK_DISTANCE)
      .on("start", function startDrag(event: D3DragEvent<SVGGElement, D3GraphNode, D3GraphNode>, node) {
        event.sourceEvent?.stopPropagation();
        dragState = {
          nodeId: node.id,
          startX: Number(node.x || 0),
          startY: Number(node.y || 0),
          moved: false
        };
        select(this).classed("is-dragging", true).raise();
        node.fx = node.x;
        node.fy = node.y;
      })
      .on("drag", function dragNode(event: D3DragEvent<SVGGElement, D3GraphNode, D3GraphNode>, node) {
        event.sourceEvent?.stopPropagation();
        if (!dragState || dragState.nodeId !== node.id) return;
        const movedDistance = Math.hypot(event.x - dragState.startX, event.y - dragState.startY);
        if (!dragState.moved && movedDistance < GRAPH_DRAG_CLICK_DISTANCE) return;
        dragState.moved = true;
        node.x = event.x;
        node.y = event.y;
        node.fx = event.x;
        node.fy = event.y;
        renderGraphPositions(nodeSelection, linkSelection);
      })
      .on("end", function endDrag(event: D3DragEvent<SVGGElement, D3GraphNode, D3GraphNode>, node) {
        event.sourceEvent?.stopPropagation();
        select(this).classed("is-dragging", false);
        node.fx = undefined;
        node.fy = undefined;
        if (dragState?.moved) {
          suppressClickNodeId = node.id;
          saveGraphNodePositions(storageKey, graphModel.nodes);
          window.setTimeout(() => {
            if (suppressClickNodeId === node.id) suppressClickNodeId = "";
          }, 120);
        }
        dragState = null;
      });

    nodeSelection
      .call(nodeDrag)
      .on("pointerdown", (event: PointerEvent, node) => {
        if (event.button !== 0) return;
        pointerClickState = {
          nodeId: node.id,
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          moved: false
        };
      })
      .on("pointermove", (event: PointerEvent, node) => {
        if (!pointerClickState || pointerClickState.nodeId !== node.id || pointerClickState.pointerId !== event.pointerId) return;
        const movedDistance = Math.hypot(event.clientX - pointerClickState.clientX, event.clientY - pointerClickState.clientY);
        if (movedDistance >= GRAPH_DRAG_CLICK_DISTANCE) {
          pointerClickState.moved = true;
        }
      })
      .on("pointercancel", (event: PointerEvent, node) => {
        if (pointerClickState?.nodeId !== node.id || pointerClickState.pointerId !== event.pointerId) return;
        pointerClickState = null;
      })
      .on("pointerup", (event: PointerEvent, node) => {
        if (!pointerClickState || pointerClickState.nodeId !== node.id || pointerClickState.pointerId !== event.pointerId) return;
        const movedDistance = Math.hypot(event.clientX - pointerClickState.clientX, event.clientY - pointerClickState.clientY);
        const shouldOpen = !pointerClickState.moved && movedDistance < GRAPH_DRAG_CLICK_DISTANCE && suppressClickNodeId !== node.id;
        pointerClickState = null;
        if (shouldOpen) {
          openGraphNode(node, onOpenDocumentRef.current, onFocusNodeRef.current);
        }
      })
      .on("click", (event, node) => {
        event.stopPropagation();
      })
      .on("keydown", (event, node) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openGraphNode(node, onOpenDocumentRef.current, onFocusNodeRef.current);
      });

    renderGraphPositions(nodeSelection, linkSelection);

    function fit() {
      fitGraph(svg, zoomBehavior, graphModel.nodes, containerElement);
    }

    graphApiRef.current = {
      zoomBy(multiplier) {
        svg.call(zoomBehavior.scaleBy, multiplier);
      },
      fit
    };

    const resizeObserver = new ResizeObserver(() => {
      fit();
    });
    resizeObserver.observe(containerElement);

    const fitFrame = requestAnimationFrame(fit);

    return () => {
      cancelAnimationFrame(fitFrame);
      resizeObserver.disconnect();
      select(containerElement).selectAll("*").remove();
      if (graphApiRef.current?.fit === fit) graphApiRef.current = null;
    };
  }, [graphModel, storageKey]);

  return (
    <div className="graph-map-shell">
      <div className="graph-map" ref={containerRef} />
      <div className="graph-map-controls" aria-label="Graph controls">
        <button type="button" onClick={() => graphApiRef.current?.zoomBy(GRAPH_ZOOM_IN_FACTOR)} title="Zoom in" aria-label="Zoom in">
          <Plus size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => graphApiRef.current?.zoomBy(GRAPH_ZOOM_OUT_FACTOR)} title="Zoom out" aria-label="Zoom out">
          <Minus size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => graphApiRef.current?.fit()} title="Fit graph" aria-label="Fit graph">
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

function buildD3GraphModel(
  nodes: GraphMapNode[],
  edges: GraphMapEdge[],
  focusedNodeId: string,
  storageKey: string
): D3GraphModel {
  const degreeByNodeId = getGraphDegreeByNodeId(nodes, edges);
  const targetPositions = buildGraphTargetPositions(nodes, edges, focusedNodeId, degreeByNodeId);
  const storedPositions = readStoredGraphNodePositions(storageKey, nodes);

  const graphNodes = nodes.map((node, index): D3GraphNode => {
    const type = String(node.type || "node");
    const visualType = graphNodeVisualKind(node);
    const degree = degreeByNodeId.get(node.id) || 0;
    const isRoot = node.id === focusedNodeId || (!focusedNodeId && type === "project");
    const colors = graphNodeVisualStyle(visualType, node);
    const target = targetPositions.get(node.id) || fallbackGraphPosition(index, nodes.length);
    const storedPosition = storedPositions?.[node.id];
    const position = storedPosition || deterministicJitteredPosition(target, node.id);

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
      sourceKind: edge.sourceKind || "",
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
  if (link.type === "implements" || link.type === "depends-on") return 230;
  return 205;
}

function buildGraphTargetPositions(
  nodes: GraphMapNode[],
  edges: GraphMapEdge[],
  focusedNodeId: string,
  degreeByNodeId: Map<string, number>
): Map<string, GraphNodePosition> {
  if (!focusedNodeId) return buildOverviewTargetPositions(nodes, degreeByNodeId);

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  if (!nodeById.has(focusedNodeId)) return buildOverviewTargetPositions(nodes, degreeByNodeId);

  const directIncoming = new Set(edges.filter((edge) => edge.target === focusedNodeId).map((edge) => edge.source));
  const directOutgoing = new Set(edges.filter((edge) => edge.source === focusedNodeId).map((edge) => edge.target));
  const assigned = new Set<string>([focusedNodeId]);
  const positions = new Map<string, GraphNodePosition>([[focusedNodeId, { x: 0, y: 0 }]]);

  const directNodes = sortLayoutNodes(
    nodes.filter((node) => node.id !== focusedNodeId && (directIncoming.has(node.id) || directOutgoing.has(node.id))),
    degreeByNodeId
  );
  placeCompactFocusedRing(directNodes.map((node) => node.id), 280, 170, -Math.PI / 2, positions);
  markAssigned(assigned, directNodes);

  const secondaryNodeIds = collectUndirectedNeighborNodeIds(directNodes.map((node) => node.id), focusedNodeId, edges);
  const secondaryNodes = sortLayoutNodes(
    nodes.filter((node) => !assigned.has(node.id) && secondaryNodeIds.has(node.id)),
    degreeByNodeId
  );
  placeCompactFocusedRing(secondaryNodes.map((node) => node.id), 470, 180, -Math.PI * 0.2, positions);
  markAssigned(assigned, secondaryNodes);

  const orbitNodes = sortLayoutNodes(nodes.filter((node) => !assigned.has(node.id)), degreeByNodeId);
  placeCompactFocusedRing(orbitNodes.map((node) => node.id), 660, 190, Math.PI * 0.16, positions);

  return positions;
}

function buildOverviewTargetPositions(
  nodes: GraphMapNode[],
  degreeByNodeId: Map<string, number>
): Map<string, GraphNodePosition> {
  const positions = new Map<string, GraphNodePosition>();
  const sortedNodes = sortLayoutNodes(nodes, degreeByNodeId);
  const projectNodes = sortedNodes.filter((node) => node.type === "project");
  const rootNodes = sortedNodes.filter((node) => node.type !== "project" && isRootLikeNode(node));
  const hubNodes = sortedNodes.filter((node) => !isRootLikeNode(node) && isHubLikeNode(node));
  const leafNodes = sortedNodes.filter((node) => !isRootLikeNode(node) && !isHubLikeNode(node));

  placeRingCluster(projectNodes.map((node) => node.id), 0, 240, -Math.PI / 2, positions);
  placeRingCluster(rootNodes.map((node) => node.id), 340, 260, -Math.PI * 0.82, positions);
  placeRingCluster(hubNodes.map((node) => node.id), 660, 260, -Math.PI * 0.95, positions);
  placeRingCluster(leafNodes.map((node) => node.id), 980, 260, -Math.PI * 0.08, positions);

  return positions;
}

function collectUndirectedNeighborNodeIds(
  startNodeIds: string[],
  excludedNodeId: string,
  edges: GraphMapEdge[]
): Set<string> {
  const startSet = new Set(startNodeIds);
  const related = new Set<string>();
  for (const edge of edges) {
    if (startSet.has(edge.source) && edge.target !== excludedNodeId) related.add(edge.target);
    if (startSet.has(edge.target) && edge.source !== excludedNodeId) related.add(edge.source);
  }
  return related;
}

function placeCompactFocusedRing(
  nodeIds: string[],
  baseRadius: number,
  ringGap: number,
  startAngle: number,
  positions: Map<string, GraphNodePosition>
): void {
  if (!nodeIds.length) return;
  const minimumArcSpace = 150;
  let consumed = 0;
  let ringIndex = 0;

  while (consumed < nodeIds.length) {
    const radius = baseRadius + ringIndex * ringGap;
    const remaining = nodeIds.length - consumed;
    const ringCapacity = Math.max(5, Math.floor((Math.PI * 2 * radius) / minimumArcSpace));
    const ringCount = Math.min(remaining, ringCapacity);
    const angleStep = (Math.PI * 2) / ringCount;
    const ringStartAngle = startAngle + ringIndex * 0.31 + (ringCount === 1 ? 0.38 : 0);

    for (let index = 0; index < ringCount; index += 1) {
      const nodeId = nodeIds[consumed + index];
      const angle = ringStartAngle + index * angleStep;
      positions.set(nodeId, {
        x: Math.round(Math.cos(angle) * radius),
        y: Math.round(Math.sin(angle) * radius)
      });
    }

    consumed += ringCount;
    ringIndex += 1;
  }
}

function placeRingCluster(
  nodeIds: string[],
  radius: number,
  ringGap: number,
  startAngle: number,
  positions: Map<string, GraphNodePosition>
): void {
  if (!nodeIds.length) return;
  if (radius === 0) {
    nodeIds.forEach((nodeId, index) => {
      positions.set(nodeId, index === 0 ? { x: 0, y: 0 } : fallbackGraphPosition(index, nodeIds.length));
    });
    return;
  }

  const maxPerRing = Math.max(7, Math.floor((Math.PI * 2 * radius) / 190));
  nodeIds.forEach((nodeId, index) => {
    const ringIndex = Math.floor(index / maxPerRing);
    const ringItemIndex = index % maxPerRing;
    const ringItems = Math.min(maxPerRing, nodeIds.length - ringIndex * maxPerRing);
    const ringRadius = radius + ringIndex * ringGap;
    const angle = startAngle + (Math.PI * 2 * ringItemIndex) / ringItems + ringIndex * 0.19;
    positions.set(nodeId, {
      x: Math.round(Math.cos(angle) * ringRadius),
      y: Math.round(Math.sin(angle) * ringRadius)
    });
  });
}

function markAssigned(assigned: Set<string>, nodes: GraphMapNode[]): void {
  for (const node of nodes) assigned.add(node.id);
}

function sortLayoutNodes(nodes: GraphMapNode[], degreeByNodeId: Map<string, number>): GraphMapNode[] {
  return [...nodes].sort((left, right) => {
    const leftWeight = graphLayoutWeight(left.type, degreeByNodeId.get(left.id) || 0, false);
    const rightWeight = graphLayoutWeight(right.type, degreeByNodeId.get(right.id) || 0, false);
    return rightWeight - leftWeight || left.label.localeCompare(right.label);
  });
}

function isRootLikeNode(node: GraphMapNode): boolean {
  return ["project", "repo", "workstream"].includes(String(node.type || ""));
}

function isHubLikeNode(node: GraphMapNode): boolean {
  return ["topic", "service", "package", "diagram-group", "code-area", "task", "session"].includes(String(node.type || ""));
}

function renderGraphPositions(
  nodeSelection: Selection<SVGGElement, D3GraphNode, SVGGElement, unknown>,
  linkSelection: Selection<SVGPathElement, D3GraphLink, SVGGElement, unknown>
): void {
  nodeSelection.attr("transform", (node) => `translate(${Number(node.x || 0)},${Number(node.y || 0)})`);
  linkSelection.attr("d", graphLinkPath);
}

function graphLinkPath(link: D3GraphLink): string {
  const source = resolveLinkNode(link.source);
  const target = resolveLinkNode(link.target);
  const sourceX = Number(source.x || 0);
  const sourceY = Number(source.y || 0);
  const targetX = Number(target.x || 0);
  const targetY = Number(target.y || 0);
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const unitX = dx / distance;
  const unitY = dy / distance;
  const startX = sourceX + unitX * (source.radius + 8);
  const startY = sourceY + unitY * (source.radius + 8);
  const endX = targetX - unitX * (target.radius + 12);
  const endY = targetY - unitY * (target.radius + 12);
  const bend = Math.min(92, distance * (link.type === "contains" ? 0.075 : 0.13));
  const direction = stableHash(`${link.id}:${link.type}`) % 2 === 0 ? -1 : 1;
  const controlX = (startX + endX) / 2 - unitY * bend * direction;
  const controlY = (startY + endY) / 2 + unitX * bend * direction;

  return `M${roundPathNumber(startX)},${roundPathNumber(startY)}Q${roundPathNumber(controlX)},${roundPathNumber(controlY)} ${roundPathNumber(endX)},${roundPathNumber(endY)}`;
}

function resolveLinkNode(node: string | D3GraphNode): D3GraphNode {
  if (typeof node !== "string") return node;
  return {
    id: node,
    type: "node",
    typeLabel: "Node",
    label: node,
    metadata: "",
    graphNode: {},
    radius: 40,
    degree: 0,
    fillColor: "#fff8f1",
    accentColor: "#b87333",
    textColor: "#5d4030",
    isAnchor: false,
    isRoot: false,
    documentId: "",
    focusable: false,
    targetX: 0,
    targetY: 0,
    x: 0,
    y: 0
  };
}

function fitGraph(
  svg: Selection<SVGSVGElement, unknown, null, undefined>,
  zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>,
  nodes: D3GraphNode[],
  container: HTMLDivElement
): void {
  if (!nodes.length || !container.clientWidth || !container.clientHeight) return;
  const bounds = getGraphBounds(nodes);
  const availableWidth = Math.max(320, container.clientWidth - GRAPH_FIT_PADDING * 2);
  const availableHeight = Math.max(260, container.clientHeight - GRAPH_FIT_PADDING * 2);
  const scale = Math.max(
    GRAPH_MIN_ZOOM,
    Math.min(GRAPH_MAX_ZOOM, Math.min(availableWidth / bounds.width, availableHeight / bounds.height))
  );
  const translateX = container.clientWidth / 2 - scale * (bounds.x + bounds.width / 2);
  const translateY = container.clientHeight / 2 - scale * (bounds.y + bounds.height / 2);
  svg.call(zoomBehavior.transform, zoomIdentity.translate(translateX, translateY).scale(scale));
}

function getGraphBounds(nodes: D3GraphNode[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const x = Number(node.x || 0);
    const y = Number(node.y || 0);
    minX = Math.min(minX, x - node.radius);
    maxX = Math.max(maxX, x + node.radius);
    minY = Math.min(minY, y - node.radius);
    maxY = Math.max(maxY, y + node.radius);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { x: -100, y: -100, width: 200, height: 200 };
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function openGraphNode(
  node: D3GraphNode,
  onOpenDocument: (documentId: string) => void,
  onFocusNode: (nodeId: string) => void
): void {
  if (node.documentId) {
    onOpenDocument(node.documentId);
    return;
  }

  if (node.focusable) {
    onFocusNode(node.id);
    return;
  }
}

function appendWrappedLabel(
  textSelection: Selection<SVGTextElement, D3GraphNode, null, undefined>,
  node: D3GraphNode
): void {
  const lines = wrappedGraphLabelLines(node);
  const lineHeight = graphNodeFontSize(node) + 2;
  const startY = -((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, index) => {
    textSelection.append("tspan")
      .attr("x", 0)
      .attr("y", startY + index * lineHeight)
      .text(line);
  });
}

function wrappedGraphLabelLines(node: D3GraphNode): string[] {
  const maxChars = Math.max(9, Math.floor(node.radius / 4.2));
  const sourceLines = truncateGraphLabel(node.label, node.radius > 52 ? 54 : 42).split("\n");
  const wrappedLines: string[] = [];

  for (const sourceLine of sourceLines) {
    const words = sourceLine.trim().split(/\s+/).filter(Boolean);
    let currentLine = "";
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length <= maxChars) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) wrappedLines.push(currentLine);
      currentLine = word.length > maxChars ? `${word.slice(0, Math.max(3, maxChars - 1))}...` : word;
    }
    if (currentLine) wrappedLines.push(currentLine);
  }

  const maxLines = node.radius > 54 ? 4 : 3;
  if (wrappedLines.length <= maxLines) return wrappedLines.length ? wrappedLines : [node.id];

  const visibleLines = wrappedLines.slice(0, maxLines);
  visibleLines[visibleLines.length - 1] = `${visibleLines[visibleLines.length - 1].replace(/\.+$/, "")}...`;
  return visibleLines;
}

function graphNodeAccessibleLabel(node: D3GraphNode): string {
  return [node.label.replace(/\n/g, " "), node.typeLabel, node.metadata].filter(Boolean).join(", ");
}

function graphLinkAccessibleLabel(link: D3GraphLink): string {
  const confidence = typeof link.confidence === "number" ? `confidence ${Math.round(link.confidence * 100)}%` : "";
  const evidence = (link.evidence || [])
    .map((item) => item.quote || "")
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
  return [
    link.label || link.type,
    link.sourceKind.includes("semantic") ? "semantic" : "",
    link.semanticStatus,
    confidence,
    link.reason,
    evidence
  ].filter(Boolean).join("\n");
}

function getGraphDegreeByNodeId(nodes: GraphMapNode[], edges: GraphMapEdge[]): Map<string, number> {
  const degree = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  return degree;
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

function graphNodeRadius(type: string, degree: number, isRoot: boolean): number {
  if (isRoot) return 72;
  if (type === "project") return 62;
  if (type === "repo" || type === "workstream") return 58;
  if (type === "topic" || type === "service" || type === "package" || type === "diagram-group" || type === "code-area") {
    return Math.min(62, 46 + degree * 1.7);
  }
  if (type === "task" || type === "session") return Math.min(54, 42 + degree * 1.4);
  return Math.min(48, 36 + degree * 1.1);
}

function graphNodeFontSize(node: D3GraphNode): number {
  if (node.isRoot) return 17;
  if (node.radius >= 58) return 15;
  if (node.radius >= 48) return 13;
  return 12;
}

export function graphNodeVisualStyle(type: string, node?: Pick<GraphMapNode, "id" | "label">): { fill: string; accent: string; text: string } {
  if (type === "repo" && node) {
    return repoNodeVisualStyle(node);
  }

  const colors: Record<string, { fill: string; accent: string; text: string }> = {
    project: { fill: "#e0e7ff", accent: "#4f46e5", text: "#312e81" },
    repo: { fill: "#e5f7fb", accent: "#0891b2", text: "#164e63" },
    workstream: { fill: "#ecfdf5", accent: "#059669", text: "#064e3b" },
    topic: { fill: "#e8f6f3", accent: "#0f766e", text: "#134e4a" },
    service: { fill: "#ffeded", accent: "#dc2626", text: "#7f1d1d" },
    package: { fill: "#f7ebff", accent: "#9333ea", text: "#581c87" },
    "diagram-group": { fill: "#fff7ed", accent: "#f97316", text: "#7c2d12" },
    "code-area": { fill: "#f1f5f9", accent: "#64748b", text: "#334155" },
    task: { fill: "#f0fdf4", accent: "#16a34a", text: "#14532d" },
    session: { fill: "#ecfeff", accent: "#06b6d4", text: "#155e75" },
    doc: { fill: "#eff6ff", accent: "#3b82f6", text: "#1e3a8a" },
    diagram: { fill: "#fffbeb", accent: "#f59e0b", text: "#78350f" },
    decision: { fill: "#faf5ff", accent: "#a855f7", text: "#581c87" },
    command: { fill: "#f1f5f9", accent: "#475569", text: "#1e293b" },
    gotcha: { fill: "#fff1f2", accent: "#e11d48", text: "#881337" },
    file: { fill: "#f8fafc", accent: "#94a3b8", text: "#334155" },
    "external-reference": { fill: "#fefce8", accent: "#ca8a04", text: "#713f12" }
  };
  return colors[type] || { fill: "#f5f3ff", accent: "#8b5cf6", text: "#4c1d95" };
}

function repoNodeVisualStyle(node: Pick<GraphMapNode, "id" | "label">): { fill: string; accent: string; text: string } {
  const palette = [
    { fill: "#e0f2fe", accent: "#0284c7", text: "#0c4a6e" },
    { fill: "#dcfce7", accent: "#16a34a", text: "#14532d" },
    { fill: "#fef3c7", accent: "#d97706", text: "#78350f" },
    { fill: "#fce7f3", accent: "#db2777", text: "#831843" },
    { fill: "#ede9fe", accent: "#7c3aed", text: "#4c1d95" },
    { fill: "#ccfbf1", accent: "#0d9488", text: "#134e4a" }
  ];
  return palette[Math.abs(hashGraphStyleKey(`${node.id}:${node.label}`)) % palette.length];
}

function hashGraphStyleKey(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return hash;
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
  if (node.metadata) return `${node.label}\n${node.metadata}`;
  return node.label;
}

function truncateGraphLabel(label: string, maxLength: number): string {
  const normalized = label
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(3, maxLength - 3)).trim()}...`;
}

function fallbackGraphPosition(index: number, total: number): GraphNodePosition {
  if (total <= 1) return { x: 0, y: 0 };
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  const radius = 340 + Math.floor(index / 20) * 220;
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius)
  };
}

function deterministicJitteredPosition(position: GraphNodePosition, nodeId: string): GraphNodePosition {
  const hash = stableHash(nodeId);
  return {
    x: position.x + ((hash % 23) - 11),
    y: position.y + (((hash >> 5) % 23) - 11)
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

function saveGraphNodePositions(storageKey: string, nodes: D3GraphNode[]): void {
  if (typeof window === "undefined") return;
  const positions: StoredGraphNodePositionMap = {};
  const nodeIds: string[] = [];

  for (const node of nodes) {
    nodeIds.push(node.id);
    positions[node.id] = {
      x: Math.round(Number(node.x || 0)),
      y: Math.round(Number(node.y || 0))
    };
  }

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

function safeGraphClassName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function roundPathNumber(value: number): number {
  return Math.round(value * 10) / 10;
}
