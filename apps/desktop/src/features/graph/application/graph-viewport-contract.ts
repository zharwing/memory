export interface GraphViewportSelection {
  focusedNodeId: string;
  selectedNodeId: string;
  selectedEdgeId: string;
}

export interface GraphViewportLayout {
  storageKey: string;
  revision: number;
}

export interface GraphViewportAvailability {
  visualAvailable: boolean;
  omittedNodeCount: number;
  omittedEdgeCount: number;
}

/** Shared presentation contract for the spatial and structured graph views. */
export interface GraphViewportModel<Node, Edge> {
  nodes: readonly Node[];
  edges: readonly Edge[];
  selection: GraphViewportSelection;
  layout: GraphViewportLayout;
  availability: GraphViewportAvailability;
}

/** Shared graph intents; each view decides how to expose them accessibly. */
export interface GraphViewportActions<Edge> {
  openDocument(documentId: string): void;
  selectNode(nodeId: string): void;
  focusNode(nodeId: string): void;
  selectEdge(edge: Edge): void;
}
