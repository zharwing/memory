import {
  type GraphViewMode,
  graphDisplayEdge,
  graphEdgeColor,
  graphEdgeLabel,
  graphNodeTypeLabel,
  isGraphAnchorNode,
  selectGraphEdgesForView,
  summarizeEdgeTypes,
  summarizeNodeTypes
} from "./graph-display.js";

export interface GraphMapNode {
  id: string;
  type: string;
  displayType: string;
  typeLabel: string;
  label: string;
  metadata: string;
  graphNode: any;
  isAnchor: boolean;
}

export interface GraphMapEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
  color: string;
  reason: string;
  sourceKind?: string;
  semanticEdgeId?: string;
  semanticStatus?: string;
  confidence?: number;
  evidence?: Array<{ quote?: string; documentId?: string; location?: string; sourcePath?: string }>;
}

export interface GraphFlowElements {
  nodes: GraphMapNode[];
  edges: GraphMapEdge[];
  edgeTypes: Array<{ type: string; count: number }>;
  hiddenMemberships: number;
  hiddenLeafNodes: number;
  focusLabel?: string;
}

export function graphNodeVisualKind(node: Pick<GraphMapNode, "type" | "displayType">): string {
  const type = String(node.type || "node");
  const displayType = String(node.displayType || type);
  if (type === "diagram" || displayType === "diagram") return "diagram";
  if (type === "doc") return "doc";
  return displayType || type;
}

export function buildGraphFlowElements(graph: any, viewMode: GraphViewMode, focusedNodeId = ""): GraphFlowElements {
  const allNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const allEdges = Array.isArray(graph?.edges) ? graph.edges : [];
  const nodeById = new Map<string, any>(allNodes.map((sourceNode: any) => [sourceNode.id, sourceNode]));
  const graphSelection = selectGraphEdgesForView(allEdges, allNodes, viewMode, focusedNodeId);
  const visibleEdges = graphSelection.edges;
  const visibleNodeIds = graphSelection.nodeIds;
  const hiddenMemberships = allEdges.filter((sourceEdge: any) => sourceEdge.type === "belongs-to").length - visibleEdges.filter((sourceEdge: any) => sourceEdge.type === "belongs-to").length;

  const sourceNodes = allNodes.filter((sourceNode: any) => visibleNodeIds.has(sourceNode.id));
  const hiddenLeafNodes = viewMode === "all" ? 0 : allNodes.filter((sourceNode: any) => !visibleNodeIds.has(sourceNode.id)).length;
  const nodeIds = new Set<string>();

  const nodes: GraphMapNode[] = sourceNodes.map((sourceNode: any) => {
    nodeIds.add(sourceNode.id);
    const nodeType = String(sourceNode.type || "doc");
    const displayType = String(sourceNode.documentType || nodeType);
    const metadata = [sourceNode.status, sourceNode.visibility].filter(Boolean).join(" / ");
    const secondaryMetadata = metadata || (isGraphAnchorNode(sourceNode) ? "" : graphNodeTypeLabel(nodeType));

    return {
      id: sourceNode.id,
      type: nodeType,
      displayType,
      typeLabel: graphNodeTypeLabel(displayType),
      label: String(sourceNode.label || sourceNode.id),
      metadata: secondaryMetadata,
      graphNode: sourceNode,
      isAnchor: isGraphAnchorNode(sourceNode)
    };
  });

  const edges: GraphMapEdge[] = visibleEdges
    .filter((sourceEdge: any) => nodeIds.has(sourceEdge.from) && nodeIds.has(sourceEdge.to))
    .map((sourceEdge: any) => {
      const edgeType = String(sourceEdge.type || "related");
      const displayEdge = graphDisplayEdge(sourceEdge, viewMode);
      return {
        id: String(sourceEdge.id || `${displayEdge.source}->${edgeType}->${displayEdge.target}`),
        source: displayEdge.source,
        target: displayEdge.target,
        type: edgeType,
        label: displayEdge.label,
        color: graphEdgeColor(edgeType, sourceEdge),
        reason: String(sourceEdge.reason || ""),
        sourceKind: String(sourceEdge.sourceKind || ""),
        semanticEdgeId: sourceEdge.semanticEdgeId ? String(sourceEdge.semanticEdgeId) : undefined,
        semanticStatus: sourceEdge.semanticStatus ? String(sourceEdge.semanticStatus) : undefined,
        confidence: typeof sourceEdge.confidence === "number" ? sourceEdge.confidence : undefined,
        evidence: Array.isArray(sourceEdge.evidence) ? sourceEdge.evidence : undefined
      };
    });

  return {
    nodes,
    edges,
    edgeTypes: summarizeEdgeTypes(visibleEdges),
    hiddenMemberships: Math.max(0, hiddenMemberships),
    hiddenLeafNodes,
    focusLabel: focusedNodeId ? nodeById.get(focusedNodeId)?.label : undefined
  };
}

export function RawStorageAudit({ graph }: { graph: any }) {
  const nodes: any[] = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges: any[] = Array.isArray(graph?.edges) ? graph.edges : [];
  const nodeTypes = summarizeNodeTypes(nodes);
  const edgeTypes = summarizeEdgeTypes(edges);
  const storageEdges = edges.filter((sourceEdge: any) => sourceEdge.type === "belongs-to");
  const contextEdges = edges.filter((sourceEdge: any) => sourceEdge.type !== "belongs-to");

  return (
    <div className="graph-audit-panel">
      <div className="graph-audit-summary">
        <div>
          <strong>{nodes.length}</strong>
          <span>stored graph nodes</span>
        </div>
        <div>
          <strong>{storageEdges.length}</strong>
          <span>storage ownership links</span>
        </div>
        <div>
          <strong>{contextEdges.length}</strong>
          <span>context relationships</span>
        </div>
      </div>
      <div className="graph-audit-grid">
        <section>
          <h3>Node types</h3>
          <GraphAuditRows rows={nodeTypes} />
        </section>
        <section>
          <h3>Edge types</h3>
          <GraphAuditRows rows={edgeTypes.map((row) => ({ ...row, type: graphEdgeLabel(row.type) }))} />
        </section>
      </div>
      <p className="graph-audit-note">
        Import audit intentionally includes storage ownership edges. Use Context map for the cleaned relationship graph.
      </p>
    </div>
  );
}

function GraphAuditRows({ rows }: { rows: Array<{ type: string; count: number }> }) {
  return (
    <div className="graph-audit-rows">
      {rows.map((row) => (
        <div key={row.type}>
          <span>{row.type}</span>
          <strong>{row.count}</strong>
        </div>
      ))}
    </div>
  );
}
