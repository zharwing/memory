import type {
  GraphEdge,
  SemanticGraphEvidence
} from "@zharwing/memory-core";
import { virtualizeGraph } from "../../features/graph/application/graph-virtualization.js";
import type {
  DisplayGraphNode,
  GraphDisplayModel,
  GraphTypeSummary,
  GraphViewMode
} from "./graph-display-types.js";
import {
  graphDisplayEdge,
  graphEdgeColor,
  graphNodeTypeLabel,
  summarizeEdgeTypes
} from "./graph-presentation.js";
import {
  isGraphAnchorNode,
  selectGraphEdgesForView
} from "./graph-selection.js";

export interface GraphMapNode {
  id: string;
  type: DisplayGraphNode["type"];
  displayType: string;
  typeLabel: string;
  label: string;
  metadata: string;
  graphNode: DisplayGraphNode;
  isAnchor: boolean;
}

export interface GraphMapEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdge["type"];
  label?: string;
  color: string;
  reason: string;
  sourceKind?: GraphEdge["sourceKind"];
  semanticEdgeId?: string;
  semanticStatus?: GraphEdge["semanticStatus"];
  confidence?: number;
  evidence?: SemanticGraphEvidence[];
}

export interface GraphFlowElements {
  nodes: GraphMapNode[];
  edges: GraphMapEdge[];
  edgeTypes: GraphTypeSummary[];
  hiddenMemberships: number;
  hiddenLeafNodes: number;
  omittedNodeCount: number;
  omittedEdgeCount: number;
  projectionLimited: boolean;
  focusLabel?: string;
}

export function graphNodeVisualKind(
  node: Pick<GraphMapNode, "type" | "displayType">
): string {
  const type = node.type || "node";
  const displayType = node.displayType || type;
  if (type === "diagram" || displayType === "diagram") return "diagram";
  if (type === "doc") return "doc";
  return displayType || type;
}

export function buildGraphFlowElements(
  graph: GraphDisplayModel | undefined,
  viewMode: GraphViewMode,
  focusedNodeId = ""
): GraphFlowElements {
  const allNodes = graph?.nodes ?? [];
  const allEdges = graph?.edges ?? [];
  const nodeById = new Map<string, DisplayGraphNode>(
    allNodes.map((sourceNode) => [sourceNode.id, sourceNode])
  );
  const graphSelection = selectGraphEdgesForView(allEdges, allNodes, viewMode, focusedNodeId);
  const visibleEdges = graphSelection.edges;
  const visibleNodeIds = graphSelection.nodeIds;
  const hiddenMemberships =
    allEdges.filter((sourceEdge) => sourceEdge.type === "belongs-to").length -
    visibleEdges.filter((sourceEdge) => sourceEdge.type === "belongs-to").length;

  const sourceNodes = allNodes.filter((sourceNode) => visibleNodeIds.has(sourceNode.id));
  const hiddenLeafNodes = viewMode === "all"
    ? 0
    : allNodes.filter((sourceNode) => !visibleNodeIds.has(sourceNode.id)).length;
  const nodeIds = new Set<string>();

  const nodes: GraphMapNode[] = sourceNodes.map((sourceNode) => {
    nodeIds.add(sourceNode.id);
    const nodeType = sourceNode.type || "doc";
    const displayType = sourceNode.documentType || nodeType;
    const metadata = [sourceNode.status, sourceNode.visibility].filter(Boolean).join(" / ");
    const secondaryMetadata = metadata || (isGraphAnchorNode(sourceNode) ? "" : graphNodeTypeLabel(nodeType));

    return {
      id: sourceNode.id,
      type: nodeType,
      displayType,
      typeLabel: graphNodeTypeLabel(displayType),
      label: sourceNode.label || sourceNode.id,
      metadata: secondaryMetadata,
      graphNode: sourceNode,
      isAnchor: isGraphAnchorNode(sourceNode)
    };
  });

  const edges: GraphMapEdge[] = visibleEdges
    .filter((sourceEdge) => nodeIds.has(sourceEdge.from) && nodeIds.has(sourceEdge.to))
    .map((sourceEdge) => {
      const edgeType = sourceEdge.type || "related";
      const displayEdge = graphDisplayEdge(sourceEdge, viewMode);
      return {
        id: sourceEdge.id || `${displayEdge.source}->${edgeType}->${displayEdge.target}`,
        source: displayEdge.source,
        target: displayEdge.target,
        type: edgeType,
        label: displayEdge.label,
        color: graphEdgeColor(edgeType, sourceEdge),
        reason: sourceEdge.reason || "",
        sourceKind: sourceEdge.sourceKind,
        semanticEdgeId: sourceEdge.semanticEdgeId,
        semanticStatus: sourceEdge.semanticStatus,
        confidence: sourceEdge.confidence,
        evidence: sourceEdge.evidence?.slice(0, 20).map((item) => ({
          quote: item.quote,
          documentId: item.documentId,
          location: item.location,
          sourcePath: item.sourcePath
        }))
      };
    });

  const virtualized = virtualizeGraph(nodes, edges, focusedNodeId);

  return {
    nodes: virtualized.nodes,
    edges: virtualized.edges,
    edgeTypes: summarizeEdgeTypes(virtualized.edges),
    hiddenMemberships: Math.max(0, hiddenMemberships),
    hiddenLeafNodes,
    omittedNodeCount: virtualized.omittedNodeCount,
    omittedEdgeCount: virtualized.omittedEdgeCount,
    projectionLimited: virtualized.limited,
    focusLabel: focusedNodeId ? nodeById.get(focusedNodeId)?.label || undefined : undefined
  };
}
