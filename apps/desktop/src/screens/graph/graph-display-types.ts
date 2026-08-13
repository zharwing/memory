import type {
  GraphEdge,
  GraphNode,
  MemoryDocument,
  ProjectGraph
} from "@zharwing/memory-core";

export type GraphViewMode = "context" | "all";

export interface GraphFocusOption {
  id: string;
  label: string;
  type: string;
  degree: number;
}

/**
 * A graph node after the UI projection has joined optional document metadata.
 * The canonical graph node remains intact; the extra fields are display-only.
 */
export interface DisplayGraphNode extends GraphNode {
  documentType?: MemoryDocument["type"];
  filePath?: string;
}

/**
 * The display graph deliberately keeps graph metadata optional because the
 * resource is rendered while its first project payload is still loading.
 */
export interface GraphDisplayModel {
  projectId?: ProjectGraph["projectId"];
  visibility?: ProjectGraph["visibility"];
  generated?: ProjectGraph["generated"];
  nodes: DisplayGraphNode[];
  edges: GraphEdge[];
  displayProjected?: boolean;
}

export interface GraphEdgeSelection {
  edges: GraphEdge[];
  nodeIds: Set<string>;
}

export interface GraphDisplayEdge {
  source: string;
  target: string;
  label?: string;
}

export interface GraphTypeSummary {
  type: string;
  count: number;
}

export interface GraphStats {
  nodes: number;
  memberships: number;
  relationships: number;
  edgeTypes: GraphTypeSummary[];
}
