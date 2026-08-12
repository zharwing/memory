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
import { virtualizeGraph } from "../../features/graph/application/graph-virtualization.js";

export interface GraphMapNode {
  id: string;
  type: string;
  displayType: string;
  typeLabel: string;
  label: string;
  metadata: string;
  graphNode: unknown;
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
  omittedNodeCount: number;
  omittedEdgeCount: number;
  projectionLimited: boolean;
  focusLabel?: string;
}

export function graphNodeVisualKind(node: Pick<GraphMapNode, "type" | "displayType">): string {
  const type = String(node.type || "node");
  const displayType = String(node.displayType || type);
  if (type === "diagram" || displayType === "diagram") return "diagram";
  if (type === "doc") return "doc";
  return displayType || type;
}

export function buildGraphFlowElements(graph: unknown, viewMode: GraphViewMode, focusedNodeId = ""): GraphFlowElements {
  const graphRecord = objectRecord(graph);
  const allNodes = recordArray(graphRecord?.nodes);
  const allEdges = recordArray(graphRecord?.edges);
  const nodeById = new Map<string, UnknownRecord>(
    allNodes.map((sourceNode) => [readGraphString(sourceNode, "id"), sourceNode])
  );
  const graphSelection = selectGraphEdgesForView(allEdges, allNodes, viewMode, focusedNodeId);
  const visibleEdges = graphSelection.edges;
  const visibleNodeIds = graphSelection.nodeIds;
  const hiddenMemberships = allEdges.filter((sourceEdge) => sourceEdge.type === "belongs-to").length - visibleEdges.filter((sourceEdge: UnknownRecord) => sourceEdge.type === "belongs-to").length;

  const sourceNodes = allNodes.filter((sourceNode) => visibleNodeIds.has(readGraphString(sourceNode, "id")));
  const hiddenLeafNodes = viewMode === "all" ? 0 : allNodes.filter((sourceNode) => !visibleNodeIds.has(readGraphString(sourceNode, "id"))).length;
  const nodeIds = new Set<string>();

  const nodes: GraphMapNode[] = sourceNodes.map((sourceNode) => {
    const sourceNodeId = readGraphString(sourceNode, "id");
    nodeIds.add(sourceNodeId);
    const nodeType = readGraphString(sourceNode, "type") || "doc";
    const displayType = readGraphString(sourceNode, "documentType") || nodeType;
    const metadata = [readGraphString(sourceNode, "status"), readGraphString(sourceNode, "visibility")].filter(Boolean).join(" / ");
    const secondaryMetadata = metadata || (isGraphAnchorNode(sourceNode) ? "" : graphNodeTypeLabel(nodeType));

    return {
      id: sourceNodeId,
      type: nodeType,
      displayType,
      typeLabel: graphNodeTypeLabel(displayType),
      label: readGraphString(sourceNode, "label") || sourceNodeId,
      metadata: secondaryMetadata,
      graphNode: sourceNode,
      isAnchor: isGraphAnchorNode(sourceNode)
    };
  });

  const edges: GraphMapEdge[] = visibleEdges
    .filter((sourceEdge: UnknownRecord) => nodeIds.has(readGraphString(sourceEdge, "from")) && nodeIds.has(readGraphString(sourceEdge, "to")))
    .map((sourceEdge: UnknownRecord) => {
      const edgeType = readGraphString(sourceEdge, "type") || "related";
      const displayEdge = graphDisplayEdge(sourceEdge, viewMode);
      return {
        id: readGraphString(sourceEdge, "id") || `${displayEdge.source}->${edgeType}->${displayEdge.target}`,
        source: displayEdge.source,
        target: displayEdge.target,
        type: edgeType,
        label: displayEdge.label,
        color: graphEdgeColor(edgeType, sourceEdge),
        reason: readGraphString(sourceEdge, "reason"),
        sourceKind: readGraphString(sourceEdge, "sourceKind") || undefined,
        semanticEdgeId: readGraphString(sourceEdge, "semanticEdgeId") || undefined,
        semanticStatus: readGraphString(sourceEdge, "semanticStatus") || undefined,
        confidence: typeof sourceEdge.confidence === "number" ? sourceEdge.confidence : undefined,
        evidence: graphEvidence(sourceEdge.evidence)
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
    focusLabel: focusedNodeId
      ? readGraphString(nodeById.get(focusedNodeId) ?? {}, "label") || undefined
      : undefined
  };
}

export function RawStorageAudit({ graph }: { graph: unknown }) {
  const graphRecord = objectRecord(graph);
  const nodes = recordArray(graphRecord?.nodes);
  const edges = recordArray(graphRecord?.edges);
  const nodeTypes = summarizeNodeTypes(nodes);
  const edgeTypes = summarizeEdgeTypes(edges);
  const storageEdges = edges.filter((sourceEdge) => sourceEdge.type === "belongs-to");
  const contextEdges = edges.filter((sourceEdge) => sourceEdge.type !== "belongs-to");

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

type UnknownRecord = Record<string, unknown>;

function objectRecord(input: unknown): UnknownRecord | undefined {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as UnknownRecord
    : undefined;
}

function recordArray(input: unknown): UnknownRecord[] {
  return Array.isArray(input)
    ? input.map(objectRecord).filter((item): item is UnknownRecord => item !== undefined)
    : [];
}

function readGraphString(input: UnknownRecord, key: string): string {
  const value = input[key];
  return typeof value === "string" ? value : "";
}

function graphEvidence(input: unknown): GraphMapEdge["evidence"] {
  if (!Array.isArray(input)) return undefined;
  return input.slice(0, 20).flatMap((item) => {
    const record = objectRecord(item);
    if (!record) return [];
    return [{
      quote: readGraphString(record, "quote") || undefined,
      documentId: readGraphString(record, "documentId") || undefined,
      location: readGraphString(record, "location") || undefined,
      sourcePath: readGraphString(record, "sourcePath") || undefined
    }];
  });
}
