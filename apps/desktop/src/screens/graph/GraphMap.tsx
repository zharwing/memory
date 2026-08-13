import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { GraphMapEdge, GraphMapNode } from "./graph-flow-model.js";
import { buildD3GraphModel } from "./graph-map-model.js";
import { openGraphNode, useGraphCanvas } from "./useGraphCanvas.js";
import { nextGraphKeyboardNodeId } from "../../features/graph/layout/graph-layout-adapter.js";
import { graphKeyboardCommandForKey } from "../../features/graph/application/graph-interaction-state.js";
import type {
  GraphViewportActions,
  GraphViewportModel
} from "../../features/graph/application/graph-viewport-contract.js";
import { useGraphPositionStore } from "../../features/graph/persistence/GraphPositionStoreContext.js";

export { graphNodeVisualStyle } from "./graph-map-style.js";

const GRAPH_ZOOM_IN_FACTOR = 1.7;
const GRAPH_ZOOM_OUT_FACTOR = 1 / 1.7;

export type GraphMapViewportModel = GraphViewportModel<GraphMapNode, GraphMapEdge>;
export type GraphMapViewportActions = GraphViewportActions<GraphMapEdge>;

interface GraphMapProps {
  model: GraphMapViewportModel;
  actions: GraphMapViewportActions;
}

export function GraphMap({
  model,
  actions
}: GraphMapProps) {
  const { nodes, edges, selection, layout, availability } = model;
  const { focusedNodeId, selectedNodeId } = selection;
  const { openDocument, selectNode, focusNode, selectEdge } = actions;
  const positionStore = useGraphPositionStore();
  const [activeNodeId, setActiveNodeId] = useState(selectedNodeId || focusedNodeId || nodes[0]?.id || "");
  const onOpenDocumentRef = useRef(openDocument);
  const onSelectNodeRef = useRef(selectNode);
  const onFocusNodeRef = useRef(focusNode);

  useEffect(() => {
    onOpenDocumentRef.current = openDocument;
  }, [openDocument]);

  useEffect(() => {
    onSelectNodeRef.current = selectNode;
  }, [selectNode]);

  useEffect(() => {
    onFocusNodeRef.current = focusNode;
  }, [focusNode]);

  useEffect(() => {
    setActiveNodeId((currentNodeId) => {
      if (selectedNodeId && nodes.some((node) => node.id === selectedNodeId)) return selectedNodeId;
      if (focusedNodeId && nodes.some((node) => node.id === focusedNodeId)) return focusedNodeId;
      return nodes.some((node) => node.id === currentNodeId) ? currentNodeId : nodes[0]?.id || "";
    });
  }, [focusedNodeId, nodes, selectedNodeId]);

  const graphModel = useMemo(
    () => buildD3GraphModel({
      nodes,
      edges,
      focusedNodeId,
      storedPositions: positionStore.read(layout.storageKey, nodes.map((node) => node.id))
    }),
    [edges, focusedNodeId, layout.revision, layout.storageKey, nodes, positionStore]
  );

  const activateCanvasNode = useCallback((nodeId: string) => {
    setActiveNodeId(nodeId);
    onSelectNodeRef.current(nodeId);
  }, []);

  const { containerRef, graphApiRef } = useGraphCanvas({
    model: {
      graph: graphModel,
      storageKey: layout.storageKey,
      activeNodeId,
      enabled: availability.visualAvailable
    },
    actions: {
      activateNode: activateCanvasNode,
      openDocument,
      focusNode,
      selectEdge
    },
    adapters: { positions: positionStore }
  });

  function handleCanvasKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const command = graphKeyboardCommandForKey(event.key);

    if (command) {
      event.preventDefault();
      const nextNodeId = nextGraphKeyboardNodeId(nodes, activeNodeId, command);
      if (nextNodeId) {
        setActiveNodeId(nextNodeId);
        onSelectNodeRef.current(nextNodeId);
      }
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      const activeNode = graphModel.nodes.find((node) => node.id === activeNodeId);
      if (!activeNode) return;
      event.preventDefault();
      openGraphNode(activeNode, onOpenDocumentRef.current, onFocusNodeRef.current);
    }
  }

  const activeNode = nodes.find((node) => node.id === activeNodeId);

  if (!availability.visualAvailable) return null;

  return (
    <div className="graph-map-shell">
      <p className="sr-only" id="graph-canvas-instructions">
        Use arrow keys to move through graph nodes. Press Enter or Space to open or focus the current node. Use the structured graph after the canvas for complete relationship actions.
      </p>
      <div
        aria-describedby="graph-canvas-instructions"
        aria-label={`Visual graph canvas${activeNode ? `. Current node: ${activeNode.label}, ${activeNode.typeLabel}` : ""}`}
        className="graph-map"
        onKeyDown={handleCanvasKeyDown}
        ref={containerRef}
        role="application"
        tabIndex={0}
      />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {activeNode ? `${activeNode.label}, ${activeNode.typeLabel}` : "No graph node selected"}
      </p>
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
