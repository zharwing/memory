import { useEffect, useMemo, useState } from "react";

export interface StructuredGraphNode {
  id: string;
  label: string;
  typeLabel: string;
  metadata?: string;
  graphNode?: unknown;
}

export interface StructuredGraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  reason?: string;
  sourceKind?: string;
}

interface StructuredGraphViewProps<Node extends StructuredGraphNode, Edge extends StructuredGraphEdge> {
  nodes: readonly Node[];
  edges: readonly Edge[];
  focusedNodeId: string;
  selectedNodeId: string;
  selectedEdgeId: string;
  visualAvailable: boolean;
  omittedNodeCount?: number;
  omittedEdgeCount?: number;
  documentIdForNode: (node: Node) => string | undefined;
  canFocusNode: (node: Node) => boolean;
  edgeTypeLabel: (edgeType: string) => string;
  onOpenDocument: (documentId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
  onSelectEdge: (edge: Edge) => void;
}

/**
 * Complete non-spatial projection of the bounded visual graph. Native select
 * controls keep the graph to a constant number of tab stops while preserving
 * arrow-key access to every projected node and relationship.
 */
export function StructuredGraphView<Node extends StructuredGraphNode, Edge extends StructuredGraphEdge>({
  nodes,
  edges,
  focusedNodeId,
  selectedNodeId,
  selectedEdgeId,
  visualAvailable,
  omittedNodeCount = 0,
  omittedEdgeCount = 0,
  documentIdForNode,
  canFocusNode,
  edgeTypeLabel,
  onOpenDocument,
  onSelectNode,
  onFocusNode,
  onSelectEdge
}: StructuredGraphViewProps<Node, Edge>) {
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const effectiveNodeId = nodeById.has(selectedNodeId)
    ? selectedNodeId
    : focusedNodeId && nodeById.has(focusedNodeId)
      ? focusedNodeId
      : nodes[0]?.id || "";
  const selectedNode = nodeById.get(effectiveNodeId);
  const relatedEdges = useMemo(
    () => relationshipsForStructuredNode(edges, effectiveNodeId),
    [edges, effectiveNodeId]
  );
  const [structuredEdgeId, setStructuredEdgeId] = useState(selectedEdgeId || relatedEdges[0]?.id || "");
  const selectedEdge = relatedEdges.find((edge) => edge.id === structuredEdgeId);
  const documentId = selectedNode ? documentIdForNode(selectedNode) : undefined;

  useEffect(() => {
    if (selectedEdgeId && relatedEdges.some((edge) => edge.id === selectedEdgeId)) {
      setStructuredEdgeId(selectedEdgeId);
      return;
    }
    if (!relatedEdges.some((edge) => edge.id === structuredEdgeId)) {
      setStructuredEdgeId(relatedEdges[0]?.id || "");
    }
  }, [relatedEdges, selectedEdgeId, structuredEdgeId]);

  if (!nodes.length) {
    return (
      <section className="graph-structured-view" aria-labelledby="structured-graph-heading">
        <h3 id="structured-graph-heading">Structured graph</h3>
        <p role="status">No graph nodes are available in this view.</p>
      </section>
    );
  }

  return (
    <section className="graph-structured-view" aria-labelledby="structured-graph-heading">
      <div className="graph-structured-heading">
        <h3 id="structured-graph-heading">Structured graph</h3>
        <p>
          Choose nodes and relationships with the keyboard. Spatial position and color are not required.
        </p>
      </div>
      {!visualAvailable ? (
        <p className="notice" role="status">The visual canvas is unavailable. This structured view provides the graph actions.</p>
      ) : null}
      {omittedNodeCount > 0 || omittedEdgeCount > 0 ? (
        <p className="panel-help" role="status">
          Performance view: {omittedNodeCount} lower-priority nodes and {omittedEdgeCount} relationships are outside this projection. Choose a focus to inspect another neighborhood.
        </p>
      ) : null}

      <div className="graph-structured-grid">
        <label className="graph-structured-picker">
          <span>Nodes ({nodes.length})</span>
          <select
            aria-describedby="structured-node-help"
            size={Math.min(10, Math.max(2, nodes.length))}
            value={effectiveNodeId}
            onChange={(event) => onSelectNode(event.target.value)}
          >
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>{node.label} - {node.typeLabel}</option>
            ))}
          </select>
        </label>

        <div className="graph-structured-detail" aria-live="polite">
          <p id="structured-node-help" className="sr-only">Use arrow keys to choose a node, then use the actions after the list.</p>
          <strong>{selectedNode?.label}</strong>
          <dl>
            <div><dt>Type</dt><dd>{selectedNode?.typeLabel}</dd></div>
            {selectedNode?.metadata ? <div><dt>Details</dt><dd>{selectedNode.metadata}</dd></div> : null}
            <div><dt>Relationships</dt><dd>{relatedEdges.length}</dd></div>
          </dl>
          <div className="button-row">
            {documentId ? (
              <button type="button" onClick={() => onOpenDocument(documentId)}>Open document</button>
            ) : null}
            {selectedNode && canFocusNode(selectedNode) ? (
              <button type="button" onClick={() => onFocusNode(selectedNode.id)}>
                {selectedNode.id === focusedNodeId ? "Return to overview" : "Focus this node"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="graph-structured-relationships">
        <label>
          <span>Relationships for {selectedNode?.label} ({relatedEdges.length})</span>
          <select
            disabled={!relatedEdges.length}
            value={structuredEdgeId}
            onChange={(event) => setStructuredEdgeId(event.target.value)}
          >
            {!relatedEdges.length ? <option value="">No relationships</option> : null}
            {relatedEdges.map((edge) => {
              const otherNodeId = edge.source === effectiveNodeId ? edge.target : edge.source;
              const otherNode = nodeById.get(otherNodeId);
              return (
                <option key={edge.id} value={edge.id}>
                  {edgeTypeLabel(edge.type)} - {otherNode?.label || otherNodeId}
                </option>
              );
            })}
          </select>
        </label>
        {selectedEdge ? (
          <div className="graph-structured-relationship-detail">
            <p>{selectedEdge.reason || "No explanation was recorded for this relationship."}</p>
            <button type="button" onClick={() => onSelectEdge(selectedEdge)}>Inspect relationship</button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function relationshipsForStructuredNode<Edge extends StructuredGraphEdge>(
  edges: readonly Edge[],
  nodeId: string
): Edge[] {
  return edges
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .sort((left, right) => left.type.localeCompare(right.type, "en-US") || left.id.localeCompare(right.id, "en-US"));
}
