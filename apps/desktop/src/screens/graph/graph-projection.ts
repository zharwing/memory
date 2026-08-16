import type { GraphEdge, MemoryDocument, ProjectGraph } from "@zharwing/memory-core";
import type {
  DisplayGraphNode,
  GraphDisplayModel
} from "./graph-display-types.js";

interface DisplayMemoryDocument extends MemoryDocument {
  /** Legacy imported records may still expose this pre-normalization alias. */
  path?: string;
}

export function enhanceGraphForDisplay(
  graph: ProjectGraph | undefined,
  docs: readonly DisplayMemoryDocument[] = []
): GraphDisplayModel {
  const nodes: DisplayGraphNode[] = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges: GraphEdge[] = Array.isArray(graph?.edges) ? graph.edges : [];
  const docById = new Map<string, DisplayMemoryDocument>(docs.map((doc) => [doc.id, doc]));
  const enhancedNodes = nodes.map((sourceNode): DisplayGraphNode => {
    if (!String(sourceNode.id || "").startsWith("doc:")) return sourceNode;
    const doc = docById.get(String(sourceNode.id).slice("doc:".length));
    if (!doc) return sourceNode;
    return {
      ...sourceNode,
      documentType: doc.type,
      status: sourceNode.status || doc.status,
      visibility: sourceNode.visibility || doc.visibility,
      path: sourceNode.path || sourceNode.filePath || doc.filePath || doc.path || doc.importSourcePath
    };
  });
  const sourceGraph: GraphDisplayModel = {
    ...graph,
    nodes: enhancedNodes,
    edges
  };

  return normalizeGraphForDisplay(sourceGraph);
}


function normalizeGraphForDisplay(graph: GraphDisplayModel): GraphDisplayModel {
  const nodes = graph.nodes;
  const edges = graph.edges;
  const nodeById = new Map<string, DisplayGraphNode>(
    nodes.map((node) => [String(node.id), node])
  );
  const droppedNodeIds = new Set<string>();

  for (const node of nodes) {
    if (isDiagramProjectAreaNode(node)) droppedNodeIds.add(String(node.id));
  }

  const nextNodes = new Map<string, DisplayGraphNode>();
  for (const node of nodes) {
    if (!droppedNodeIds.has(String(node.id))) nextNodes.set(String(node.id), node);
  }

  const nextEdges = new Map<string, GraphEdge>();
  for (const sourceEdge of edges) {
    const from = String(sourceEdge.from || "");
    const to = String(sourceEdge.to || "");
    if (droppedNodeIds.has(from) || droppedNodeIds.has(to)) continue;
    if (isRedundantDiagramEvidenceEdge(sourceEdge, nodeById)) continue;
    nextEdges.set(String(sourceEdge.id || `${from}->${sourceEdge.type}->${to}`), sourceEdge);
  }

  return {
    ...graph,
    nodes: [...nextNodes.values()],
    edges: [...nextEdges.values()]
  };
}

function isDiagramProjectAreaNode(node: DisplayGraphNode): boolean {
  if (!["service", "package", "code-area"].includes(node.type)) return false;
  return graphNormalizedPath(node.path).startsWith("diagrams/projects/");
}

function isRedundantDiagramEvidenceEdge(
  edge: GraphEdge,
  nodeById: ReadonlyMap<string, DisplayGraphNode>
): boolean {
  const fromNode = nodeById.get(edge.from);
  const toNode = nodeById.get(edge.to);

  if (edge.type === "explains" && toNode?.type === "diagram-group" && isDiagramDocumentNode(fromNode)) {
    return true;
  }
  if (edge.type === "mentions" && edge.to === "topic:diagrams" && isDiagramDocumentNode(fromNode)) {
    return true;
  }

  return false;
}

function isDiagramDocumentNode(node: DisplayGraphNode | undefined): boolean {
  return node?.type === "diagram" || graphNormalizedPath(node?.path).startsWith("diagrams/");
}

function graphNormalizedPath(input: string | undefined): string {
  return String(input || "").replace(/\\/g, "/").toLowerCase();
}
