import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../../stores/store-context.js";
import { routePath } from "../../utils/routes.js";
import type { GraphDisplayModel } from "./graph-display-types.js";
import { enhanceGraphForDisplay } from "./graph-projection.js";
import { getGraphFocusOptions } from "./graph-selection.js";
import { getGraphStats } from "./graph-presentation.js";
import {
  buildGraphFlowElements,
  type GraphMapEdge
} from "./graph-flow-model.js";
import {
  reconcileGraphNodeSelection,
  transitionGraphFocus
} from "../../features/graph/application/graph-interaction-state.js";
import { useGraphPositionStore } from "../../features/graph/persistence/GraphPositionStoreContext.js";
import { graphRenderCapability } from "../../features/graph/visual/graph-render-capability.js";
import { useGraphSemanticReview } from "./useGraphSemanticReview.js";
import {
  buildGraphLegendItems,
  buildGraphStatusModel,
  graphPositionStorageKey
} from "./graph-screen-presenter.js";
import { useGraphRouteResourceGuards, useGraphRouteState } from "./useGraphRouteState.js";

export type { GraphLegendItem } from "./graph-screen-presenter.js";

export function useGraphScreenController() {
  const store = useStore();
  const positionStore = useGraphPositionStore();
  const graphState = store.graph.graphResource.state;
  const graphCompleteness = store.graph.graphResource.completeness;
  const graphObservationComplete =
    (graphState.status === "success" || graphState.status === "empty") &&
    graphCompleteness?.kind === "complete";
  const graphObservationPartial =
    (graphState.status === "success" || graphState.status === "refreshing") &&
    graphCompleteness?.kind === "partial";
  const graph: GraphDisplayModel = useMemo(
    () => enhanceGraphForDisplay(store.graph.data, store.docs.list),
    [store.docs.list, store.graph.data]
  );
  const graphNodes = graph.nodes;
  const relationshipMode = store.graph.relationshipMode;
  const setRelationshipModeFromRoute = useCallback((mode: typeof relationshipMode) => {
    void store.graph.setRelationshipMode(mode);
  }, [store.graph]);
  const route = useGraphRouteState({
    relationshipMode,
    onRelationshipModeChange: setRelationshipModeFromRoute
  });
  const { viewMode, focusedNodeId, editingDocumentId, selectedEdgeId } = route;
  const [focusHistory, setFocusHistory] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState("");

  const stats = useMemo(() => getGraphStats(graph), [graph]);
  const focusOptions = useMemo(() => getGraphFocusOptions(graph), [graph]);
  const elements = useMemo(
    () => buildGraphFlowElements(graph, viewMode, focusedNodeId),
    [focusedNodeId, graph, viewMode]
  );
  const legendItems = useMemo(() => buildGraphLegendItems(elements.nodes), [elements.nodes]);
  const elementNodeById = useMemo(
    () => new Map(elements.nodes.map((node) => [node.id, node])),
    [elements.nodes]
  );
  const elementEdgeIds = useMemo(
    () => new Set(elements.edges.map((edge) => edge.id)),
    [elements.edges]
  );
  const selectedEdge = useMemo(
    () => elements.edges.find((edge) => edge.id === selectedEdgeId),
    [elements.edges, selectedEdgeId]
  );
  const graphNodeById = useMemo(
    () => new Map(graphNodes.map((node) => [node.id, node])),
    [graphNodes]
  );
  const graphNodeIds = useMemo(
    () => new Set(graphNodes.map((node) => node.id)),
    [graphNodes]
  );
  const focusedNode = focusedNodeId ? graphNodeById.get(focusedNodeId) : undefined;
  const projectId = store.projects.selectedProjectId || graph.projectId || "project";
  const positionKey = graphPositionStorageKey(projectId, viewMode, relationshipMode, focusedNodeId);
  const isRawGraph = viewMode === "all";
  const editingDocument = store.docs.list.find((document) => document.id === editingDocumentId);

  const updateSearchState = route.update;

  const clearSelectedEdge = useCallback(() => {
    updateSearchState({ edge: null });
  }, [updateSearchState]);

  const semantic = useGraphSemanticReview({
    selectedEdge,
    focusedNodeId,
    focusLabel: elements.focusLabel,
    isRawGraph,
    onClearSelectedEdge: clearSelectedEdge
  });

  useEffect(() => {
    const nodeIds = new Set(elements.nodes.map((node) => node.id));
    setSelectedNodeId((currentNodeId) =>
      reconcileGraphNodeSelection(nodeIds, currentNodeId, focusedNodeId)
    );
  }, [elements.nodes, focusedNodeId]);

  useGraphRouteResourceGuards(route, {
    focusedNodeMissing: graphNodeIds.size > 0 && (!graphNodeIds.has(focusedNodeId) || focusedNode?.type === "project"),
    editingDocumentMissing:
      store.docs.list.length > 0 && !store.docs.list.some((document) => document.id === editingDocumentId),
    selectedEdgeMissing: elementEdgeIds.size > 0 && !elementEdgeIds.has(selectedEdgeId),
    onFocusedNodeMissing: () => {
      setFocusHistory([]);
      updateSearchState({ focus: null }, true);
    }
  });

  const resetFocus = useCallback(() => {
    setFocusHistory([]);
    updateSearchState({ viewMode: "context", focus: null });
  }, [updateSearchState]);

  const setFocusFromControl = useCallback((nextNodeId: string) => {
    setFocusHistory([]);
    updateSearchState({ viewMode: "context", focus: nextNodeId || null });
  }, [updateSearchState]);

  const navigateFocus = useCallback((nextNodeId: string) => {
    const nextNode = graphNodeById.get(nextNodeId);
    const nextState = transitionGraphFocus(
      { focusedNodeId, history: focusHistory },
      nextNodeId,
      nextNode?.type === "project"
    );
    setFocusHistory([...nextState.history]);
    updateSearchState({
      viewMode: "context",
      focus: nextState.focusedNodeId || null
    });
  }, [focusHistory, focusedNodeId, graphNodeById, updateSearchState]);

  const setViewMode = useCallback((nextMode: string) => {
    if (nextMode === "all") {
      setFocusHistory([]);
      updateSearchState({ viewMode: "all", focus: null });
      return;
    }
    updateSearchState({ viewMode: "context" });
  }, [updateSearchState]);

  const resetLayout = useCallback(() => {
    positionStore.remove(positionKey);
    setLayoutVersion((currentVersion) => currentVersion + 1);
  }, [positionKey, positionStore]);

  const openDocument = useCallback((documentId: string) => {
    updateSearchState({ doc: documentId });
  }, [updateSearchState]);

  const closeDocument = useCallback(() => {
    updateSearchState({ doc: null });
  }, [updateSearchState]);

  const selectEdge = useCallback((edge: GraphMapEdge) => {
    setShowDetails(true);
    updateSearchState({ edge: edge.id });
  }, [updateSearchState]);

  const status = buildGraphStatusModel({
    graph,
    stats,
    elements,
    isRawGraph,
    focusedNodeId,
    relationshipMode
  });

  return {
    toolbar: {
      model: {
        viewMode,
        focusedNodeId,
        focusOptions,
        isRawGraph,
        hasVisibleNodes: elements.nodes.length > 0,
        showHelp
      },
      actions: {
        setViewMode,
        setFocusFromControl,
        resetFocus,
        resetLayout,
        toggleHelp: () => setShowHelp((open) => !open)
      }
    },
    status,
    details: {
      model: {
        open: showDetails,
        isRawGraph,
        focusedNodeId,
        focusLabel: elements.focusLabel,
        edgeTypes: elements.edgeTypes,
        legendItems,
        selectedEdge,
        selectedEdgeFromLabel: selectedEdge
          ? elementNodeById.get(selectedEdge.source)?.label || selectedEdge.source
          : "",
        selectedEdgeToLabel: selectedEdge
          ? elementNodeById.get(selectedEdge.target)?.label || selectedEdge.target
          : "",
        semantic: semantic.model
      },
      actions: {
        toggle: () => setShowDetails((open) => !open),
        clearSelectedEdge,
        semantic: semantic.actions
      }
    },
    content: {
      model: {
        graph,
        status: graphState.status,
        observationComplete: graphObservationComplete,
        observationPartial: graphObservationPartial,
        isRawGraph,
        elements,
        stats,
        viewport: {
          nodes: elements.nodes,
          edges: elements.edges,
          selection: { focusedNodeId, selectedNodeId, selectedEdgeId },
          layout: { storageKey: positionKey, revision: layoutVersion },
          availability: {
            visualAvailable: graphRenderCapability().available,
            omittedNodeCount: elements.omittedNodeCount,
            omittedEdgeCount: elements.omittedEdgeCount
          }
        },
        inboxRoute: routePath("inbox", { projectId: store.projects.selectedProjectId })
      },
      actions: {
        openDocument,
        selectNode: setSelectedNodeId,
        focusNode: navigateFocus,
        selectEdge,
        resetFocus
      }
    },
    editor: {
      document: editingDocument,
      documents: store.docs,
      close: closeDocument
    }
  };
}

export type GraphScreenController = ReturnType<typeof useGraphScreenController>;
