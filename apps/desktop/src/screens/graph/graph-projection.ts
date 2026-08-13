import {
  GRAPH_TOPIC_STOPWORDS,
  type GraphEdge,
  type GraphNode,
  type MemoryDocument,
  type ProjectGraph
} from "@zharwing/memory-core";
import {
  areaNode,
  cleanGraphSegments,
  diagramGroupFromSegments,
  importRelativePath,
  labelForSlug,
  normalizeGraphSlug,
  primaryAreaFromSegments
} from "@zharwing/memory-graph";
import type {
  DisplayGraphNode,
  GraphDisplayModel
} from "./graph-display-types.js";
import { isGraphLeafNode } from "./graph-selection.js";

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

  if (edges.some((sourceEdge) => sourceEdge.type !== "belongs-to")) {
    return normalizeGraphForDisplay(sourceGraph);
  }

  const nextNodes = new Map<string, DisplayGraphNode>(
    enhancedNodes.map((sourceNode) => [sourceNode.id, sourceNode])
  );
  const nextEdges = new Map<string, GraphEdge>(
    edges.map((sourceEdge) => [sourceEdge.id, sourceEdge])
  );
  const repos = enhancedNodes.filter((sourceNode) => sourceNode.type === "repo");
  const projectId = graph?.projectId || nodes[0]?.projectId || "project";

  function addNode(node: GraphNode): void {
    if (!nextNodes.has(node.id)) nextNodes.set(node.id, node);
  }

  function addEdge(
    from: string,
    to: string,
    type: GraphEdge["type"],
    reason: string
  ): void {
    const id = `${from}->${type}->${to}`;
    if (!nextEdges.has(id)) {
      nextEdges.set(id, { id, projectId, from, to, type, reason });
    }
  }

  for (const doc of enhancedNodes.filter(isGraphLeafNode)) {
    const segments = graphPathSegments(doc.path);
    if (!segments.length) continue;

    const category = normalizeGraphSlug(segments[0]);
    if (category && !GRAPH_TOPIC_STOPWORDS.has(category)) {
      const topicNode = areaNode(projectId, "topic", category, labelForSlug(category));
      addNode(topicNode);
      addEdge(doc.id, topicNode.id, "mentions", "Document path groups this memory under a topic");
    }

    const area = primaryAreaFromSegments(segments);
    if (area) {
      const displayAreaNode: DisplayGraphNode = {
        ...areaNode(projectId, area.type, area.slug, area.label),
        path: area.path
      };
      addNode(displayAreaNode);
      addEdge(
        doc.id,
        displayAreaNode.id,
        doc.type === "diagram" ? "explains" : "supports",
        "Document path identifies this context area"
      );

      if (category && !GRAPH_TOPIC_STOPWORDS.has(category)) {
        addEdge(
          `topic:${category}`,
          displayAreaNode.id,
          "contains",
          "Imported memory path groups this context area under the topic"
        );
      }

      for (const repo of reposForDisplayArea(repos, area, category)) {
        addEdge(repo.id, displayAreaNode.id, "contains", "Linked repo contains or owns this context area");
      }
    }

    const diagramGroup = diagramGroupFromSegments(segments);
    if (diagramGroup) {
      const diagramsTopic = areaNode(projectId, "topic", "diagrams", "Diagrams");
      const groupNode = areaNode(projectId, "diagram-group", diagramGroup.slug, diagramGroup.label);
      addNode(diagramsTopic);
      addNode(groupNode);
      addEdge(diagramsTopic.id, groupNode.id, "contains", "Imported diagram path groups this diagram collection");
      addEdge(groupNode.id, doc.id, "contains", "Diagram belongs to this diagram collection");
      addEdge(doc.id, groupNode.id, "explains", "Diagram is part of this context diagram collection");
    }
  }

  return normalizeGraphForDisplay({
    ...sourceGraph,
    nodes: [...nextNodes.values()],
    edges: [...nextEdges.values()],
    displayProjected: true
  });
}

function normalizeGraphForDisplay(graph: GraphDisplayModel): GraphDisplayModel {
  const nodes = graph.nodes;
  const edges = graph.edges;
  const nodeById = new Map<string, DisplayGraphNode>(
    nodes.map((node) => [String(node.id), node])
  );
  const repoIdBySlug = repoIdsBySlug(nodes);
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

  const projectId = graph.projectId || nodes[0]?.projectId || "project";
  for (const node of nextNodes.values()) {
    if (node.type !== "diagram-group") continue;
    const slug = String(node.id || "").slice("diagram-group:".length);
    if (!slug || slug === "system") continue;
    const repoId = repoIdBySlug.get(slug);
    if (!repoId || !nextNodes.has(repoId)) continue;
    const edgeId = `${repoId}->contains->${node.id}`;
    if (!nextEdges.has(edgeId)) {
      nextEdges.set(edgeId, {
        id: edgeId,
        projectId,
        from: repoId,
        to: node.id,
        type: "contains",
        reason: "Linked repo owns this diagram collection"
      });
    }
  }

  return {
    ...graph,
    nodes: [...nextNodes.values()],
    edges: [...nextEdges.values()]
  };
}

function repoIdsBySlug(nodes: readonly DisplayGraphNode[]): Map<string, string> {
  const repoIds = new Map<string, string>();
  for (const node of nodes) {
    if (node.type !== "repo") continue;
    for (const value of [node.label, node.path, node.id]) {
      const slug = normalizeGraphSlug(String(value || "").split(/[\\/]/).filter(Boolean).pop());
      if (slug) repoIds.set(slug, String(node.id));
    }
  }
  return repoIds;
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

function graphPathSegments(input: string | undefined): string[] {
  const relativePath = importRelativePath({ filePath: String(input || "") } as MemoryDocument);
  return relativePath ? cleanGraphSegments(relativePath) : [];
}

function reposForDisplayArea(
  repos: readonly DisplayGraphNode[],
  area: { type: GraphNode["type"]; slug: string },
  category: string
): DisplayGraphNode[] {
  return repos.filter((repo) => {
    const haystack = `${repo.id} ${repo.label} ${repo.path}`.toLowerCase();
    if (haystack.includes(area.slug)) return true;
    if (category === "frontend" || area.type === "package") {
      return haystack.includes("frontend") || haystack.includes("package") || haystack.includes("app");
    }
    if (category === "backend" || area.type === "service") {
      return haystack.includes("backend") || haystack.includes("service") || haystack.includes("api") || haystack.includes("worker");
    }
    return false;
  });
}
