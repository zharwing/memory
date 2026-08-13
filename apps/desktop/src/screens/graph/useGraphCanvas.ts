import { useEffect, useRef } from "react";
import {
  drag,
  select,
  zoom,
  zoomIdentity,
  type D3DragEvent,
  type Selection,
  type ZoomBehavior
} from "d3";
import { safeGraphClassName } from "./graph-presentation.js";
import { graphFitTransform, graphLinkPath } from "./graph-map-geometry.js";
import type { D3GraphLink, D3GraphModel, D3GraphNode } from "./graph-map-model.js";
import {
  graphLinkAccessibleLabel,
  graphNodeAccessibleLabel,
  graphNodeFontSize,
  wrappedGraphLabelLines
} from "./graph-map-style.js";
import type { GraphMapEdge } from "./graph-flow-model.js";
import type { GraphPositionStore } from "../../features/graph/persistence/graph-position-store.js";

const GRAPH_MIN_ZOOM = 0.06;
const GRAPH_MAX_ZOOM = 22;
const GRAPH_FIT_PADDING = 96;
const GRAPH_WORLD_LIMIT = 8000;
const GRAPH_DRAG_CLICK_DISTANCE = 6;

export interface GraphCanvasApi {
  zoomBy: (multiplier: number) => void;
  fit: () => void;
}

interface GraphCanvasModel {
  graph: D3GraphModel;
  storageKey: string;
  activeNodeId: string;
  enabled: boolean;
}

interface GraphCanvasActions {
  activateNode(nodeId: string): void;
  openDocument(documentId: string): void;
  focusNode(nodeId: string): void;
  selectEdge(edge: GraphMapEdge): void;
}

interface GraphCanvasAdapters {
  positions: GraphPositionStore;
}

interface UseGraphCanvasOptions {
  model: GraphCanvasModel;
  actions: GraphCanvasActions;
  adapters: GraphCanvasAdapters;
}

export function useGraphCanvas({ model, actions, adapters }: UseGraphCanvasOptions) {
  const { graph: graphModel, storageKey, activeNodeId, enabled } = model;
  const {
    activateNode: onActivateNode,
    openDocument: onOpenDocument,
    focusNode: onFocusNode,
    selectEdge: onSelectEdge
  } = actions;
  const positionStore = adapters.positions;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphApiRef = useRef<GraphCanvasApi | null>(null);
  const onActivateNodeRef = useRef(onActivateNode);
  const onOpenDocumentRef = useRef(onOpenDocument);
  const onFocusNodeRef = useRef(onFocusNode);
  const onSelectEdgeRef = useRef(onSelectEdge);

  useEffect(() => {
    onActivateNodeRef.current = onActivateNode;
  }, [onActivateNode]);

  useEffect(() => {
    onOpenDocumentRef.current = onOpenDocument;
  }, [onOpenDocument]);

  useEffect(() => {
    onFocusNodeRef.current = onFocusNode;
  }, [onFocusNode]);

  useEffect(() => {
    onSelectEdgeRef.current = onSelectEdge;
  }, [onSelectEdge]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;
    const containerElement: HTMLDivElement = container;

    select(container).selectAll("*").remove();

    const svg = select(container)
      .append("svg")
      .attr("class", "graph-map-svg")
      .attr("aria-hidden", "true")
      .attr("focusable", "false");

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
      .attr("tabindex", -1)
      .attr("fill", "none")
      .attr("stroke", (link) => link.color || "#b87333")
      .attr("stroke-width", (link) => link.sourceKind?.includes("semantic") ? 3.1 : link.type === "contains" ? 3 : 2.1)
      .attr("stroke-opacity", (link) => link.sourceKind?.includes("semantic") ? 0.86 : link.type === "contains" ? 0.78 : 0.64)
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
      .attr("tabindex", -1);

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
          positionStore.write(storageKey, graphModel.nodes);
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
          onActivateNodeRef.current(node.id);
          openGraphNode(node, onOpenDocumentRef.current, onFocusNodeRef.current);
        }
      })
      .on("click", (event) => {
        event.stopPropagation();
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
  }, [enabled, graphModel, positionStore, storageKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;
    select(container)
      .selectAll<SVGGElement, D3GraphNode>(".graph-map-node")
      .classed("is-keyboard-active", (node) => node.id === activeNodeId);
  }, [activeNodeId, enabled, graphModel]);

  return { containerRef, graphApiRef };
}

export function openGraphNode(
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
  }
}

function renderGraphPositions(
  nodeSelection: Selection<SVGGElement, D3GraphNode, SVGGElement, unknown>,
  linkSelection: Selection<SVGPathElement, D3GraphLink, SVGGElement, unknown>
): void {
  nodeSelection.attr("transform", (node) => `translate(${Number(node.x || 0)},${Number(node.y || 0)})`);
  linkSelection.attr("d", graphLinkPath);
}

function fitGraph(
  svg: Selection<SVGSVGElement, unknown, null, undefined>,
  zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>,
  nodes: D3GraphNode[],
  container: HTMLDivElement
): void {
  const transform = graphFitTransform(
    nodes,
    container.clientWidth,
    container.clientHeight,
    GRAPH_FIT_PADDING,
    GRAPH_MIN_ZOOM,
    GRAPH_MAX_ZOOM
  );
  if (!transform) return;
  svg.call(
    zoomBehavior.transform,
    zoomIdentity.translate(transform.translateX, transform.translateY).scale(transform.scale)
  );
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
