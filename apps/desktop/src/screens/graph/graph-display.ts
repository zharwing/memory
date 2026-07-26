import { GRAPH_TOPIC_STOPWORDS, type MemoryDocument } from "@zharwing/memory-core";
import {
  areaNode,
  cleanGraphSegments,
  diagramGroupFromSegments,
  importRelativePath,
  labelForSlug,
  normalizeGraphSlug,
  primaryAreaFromSegments
} from "@zharwing/memory-graph";
import { titleCaseSlug } from "../../utils/format.js";

export type GraphViewMode = "context" | "all";

export interface GraphFocusOption {
  id: string;
  label: string;
  type: string;
  degree: number;
}

const GRAPH_OVERVIEW_HUB_LIMIT = 36;

export function enhanceGraphForDisplay(graph: any, docs: any[] = []): any {
  const nodes: any[] = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges: any[] = Array.isArray(graph?.edges) ? graph.edges : [];
  const docById = new Map<string, any>(docs.map((doc) => [doc.id, doc]));
  const enhancedNodes = nodes.map((sourceNode: any) => {
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
  if (edges.some((sourceEdge: any) => sourceEdge.type !== "belongs-to")) {
    return normalizeGraphForDisplay({
      ...graph,
      nodes: enhancedNodes
    });
  }

  const nextNodes = new Map<string, any>(enhancedNodes.map((sourceNode: any) => [sourceNode.id, sourceNode]));
  const nextEdges = new Map<string, any>(edges.map((sourceEdge: any) => [sourceEdge.id, sourceEdge]));
  const repos = enhancedNodes.filter((sourceNode: any) => sourceNode.type === "repo");
  const projectId = String(graph?.projectId || nodes[0]?.projectId || "project");

  function addNode(node: any) {
    if (!nextNodes.has(node.id)) nextNodes.set(node.id, node);
  }

  function addEdge(from: string, to: string, type: string, reason: string) {
    const id = `${from}->${type}->${to}`;
    if (!nextEdges.has(id)) {
      nextEdges.set(id, { id, projectId, from, to, type, reason });
    }
  }

  for (const doc of enhancedNodes.filter((sourceNode: any) => isGraphLeafNode(sourceNode))) {
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
      const displayAreaNode = { ...areaNode(projectId, area.type, area.slug, area.label), path: area.path };
      addNode(displayAreaNode);
      addEdge(doc.id, displayAreaNode.id, doc.type === "diagram" ? "explains" : "supports", "Document path identifies this context area");

      if (category && !GRAPH_TOPIC_STOPWORDS.has(category)) {
        addEdge(`topic:${category}`, displayAreaNode.id, "contains", "Imported memory path groups this context area under the topic");
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
    ...graph,
    nodes: [...nextNodes.values()],
    edges: [...nextEdges.values()],
    displayProjected: true
  });
}

function normalizeGraphForDisplay(graph: any): any {
  const nodes: any[] = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges: any[] = Array.isArray(graph?.edges) ? graph.edges : [];
  const nodeById = new Map<string, any>(nodes.map((node) => [String(node.id), node]));
  const repoIdBySlug = repoIdsBySlug(nodes);
  const droppedNodeIds = new Set<string>();

  for (const node of nodes) {
    if (isDiagramProjectAreaNode(node)) droppedNodeIds.add(String(node.id));
  }

  const nextNodes = new Map<string, any>();
  for (const node of nodes) {
    if (!droppedNodeIds.has(String(node.id))) nextNodes.set(String(node.id), node);
  }

  const nextEdges = new Map<string, any>();
  for (const sourceEdge of edges) {
    const from = String(sourceEdge.from || "");
    const to = String(sourceEdge.to || "");
    if (droppedNodeIds.has(from) || droppedNodeIds.has(to)) continue;
    if (isRedundantDiagramEvidenceEdge(sourceEdge, nodeById)) continue;
    nextEdges.set(String(sourceEdge.id || `${from}->${sourceEdge.type}->${to}`), sourceEdge);
  }

  const projectId = String(graph?.projectId || nodes[0]?.projectId || "project");
  for (const node of nextNodes.values()) {
    if (String(node.type || "") !== "diagram-group") continue;
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

function repoIdsBySlug(nodes: any[]): Map<string, string> {
  const repoIds = new Map<string, string>();
  for (const node of nodes) {
    if (String(node.type || "") !== "repo") continue;
    for (const value of [node.label, node.path, node.id]) {
      const slug = normalizeGraphSlug(String(value || "").split(/[\\/]/).filter(Boolean).pop());
      if (slug) repoIds.set(slug, String(node.id));
    }
  }
  return repoIds;
}

function isDiagramProjectAreaNode(node: any): boolean {
  const type = String(node?.type || "");
  if (!["service", "package", "code-area"].includes(type)) return false;
  return graphNormalizedPath(node?.path).startsWith("diagrams/projects/");
}

function isRedundantDiagramEvidenceEdge(edge: any, nodeById: Map<string, any>): boolean {
  const edgeType = String(edge?.type || "");
  const from = String(edge?.from || "");
  const to = String(edge?.to || "");
  const fromNode = nodeById.get(from);
  const toNode = nodeById.get(to);

  if (edgeType === "explains" && String(toNode?.type || "") === "diagram-group" && isDiagramDocumentNode(fromNode)) {
    return true;
  }
  if (edgeType === "mentions" && to === "topic:diagrams" && isDiagramDocumentNode(fromNode)) {
    return true;
  }

  return false;
}

function isDiagramDocumentNode(node: any): boolean {
  return String(node?.type || "") === "diagram" || graphNormalizedPath(node?.path).startsWith("diagrams/");
}

function graphNormalizedPath(input: string | undefined): string {
  return String(input || "").replace(/\\/g, "/").toLowerCase();
}

function graphPathSegments(input: string | undefined): string[] {
  const relativePath = importRelativePath({ filePath: String(input || "") } as MemoryDocument);
  return relativePath ? cleanGraphSegments(relativePath) : [];
}

function reposForDisplayArea(repos: any[], area: { type: string; slug: string }, category: string): any[] {
  return repos.filter((repo) => {
    const haystack = `${repo.id} ${repo.label} ${repo.path}`.toLowerCase();
    if (haystack.includes(area.slug)) return true;
    if (category === "frontend" || area.type === "package") return haystack.includes("frontend") || haystack.includes("package") || haystack.includes("app");
    if (category === "backend" || area.type === "service") return haystack.includes("backend") || haystack.includes("service") || haystack.includes("api") || haystack.includes("worker");
    return false;
  });
}

export function selectGraphEdgesForView(edges: any[], nodes: any[], viewMode: GraphViewMode, focusedNodeId: string): { edges: any[]; nodeIds: Set<string> } {
  if (viewMode === "all") {
    return {
      edges,
      nodeIds: new Set<string>(nodes.map((sourceNode: any) => sourceNode.id))
    };
  }

  const contextEdges = edges.filter((sourceEdge: any) => isContextGraphEdge(sourceEdge));
  if (focusedNodeId) {
    const nodeIds = trimFocusedGraphNodeIds(nodes, graphNeighborhoodNodeIds(contextEdges, focusedNodeId, graphFocusedNeighborhoodDistance(nodes, focusedNodeId)), focusedNodeId);
    const candidateEdges = contextEdges.filter((sourceEdge: any) =>
      nodeIds.has(sourceEdge.from) &&
      nodeIds.has(sourceEdge.to)
    );
    const connectedNodeIds = graphNeighborhoodNodeIds(candidateEdges, focusedNodeId, Number.MAX_SAFE_INTEGER);
    const selectedEdges = candidateEdges.filter((sourceEdge: any) =>
      connectedNodeIds.has(sourceEdge.from) &&
      connectedNodeIds.has(sourceEdge.to)
    );
    return { edges: selectedEdges, nodeIds: connectedNodeIds };
  }

  const nodeIds = selectOverviewGraphNodeIds(nodes, contextEdges);
  const selectedEdges = contextEdges.filter((sourceEdge: any) => nodeIds.has(sourceEdge.from) && nodeIds.has(sourceEdge.to));

  return { edges: selectedEdges, nodeIds };
}

function selectOverviewGraphNodeIds(nodes: any[], contextEdges: any[]): Set<string> {
  const nodeIds = new Set<string>();
  const nodeById = new Map<string, any>(nodes.map((sourceNode: any) => [sourceNode.id, sourceNode]));
  const degree = new Map<string, number>();
  for (const sourceEdge of contextEdges) {
    degree.set(sourceEdge.from, (degree.get(sourceEdge.from) || 0) + 1);
    degree.set(sourceEdge.to, (degree.get(sourceEdge.to) || 0) + 1);
  }

  for (const sourceNode of nodes) {
    if (isOverviewRootNode(sourceNode)) nodeIds.add(sourceNode.id);
  }

  const contextEntityIds = nodes
    .filter((sourceNode: any) => isOverviewContextEntity(sourceNode))
    .filter((sourceNode: any) => (degree.get(sourceNode.id) || 0) > 0)
    .sort((left, right) => {
      const leftDegree = degree.get(left.id) || 0;
      const rightDegree = degree.get(right.id) || 0;
      return rightDegree - leftDegree ||
        graphFocusTypeRank(String(left.type || "")) - graphFocusTypeRank(String(right.type || "")) ||
        String(left.label || "").localeCompare(String(right.label || ""));
    })
    .slice(0, GRAPH_OVERVIEW_HUB_LIMIT)
    .map((sourceNode: any) => sourceNode.id);

  for (const nodeId of contextEntityIds) {
    nodeIds.add(nodeId);
    for (const sourceEdge of contextEdges) {
      if (sourceEdge.from === nodeId && isOverviewRootNode(nodeById.get(sourceEdge.to))) nodeIds.add(sourceEdge.to);
      if (sourceEdge.to === nodeId && isOverviewRootNode(nodeById.get(sourceEdge.from))) nodeIds.add(sourceEdge.from);
    }
  }

  for (const sourceEdge of contextEdges) {
    if (!isSemanticGraphEdge(sourceEdge)) continue;
    if (nodeById.has(sourceEdge.from)) nodeIds.add(sourceEdge.from);
    if (nodeById.has(sourceEdge.to)) nodeIds.add(sourceEdge.to);
  }

  return nodeIds;
}

function isOverviewRootNode(node: any): boolean {
  const type = String(node?.type || "");
  return type === "project" || type === "repo" || type === "workstream";
}

function isSemanticGraphEdge(edge: any): boolean {
  const sourceKind = String(edge?.sourceKind || "");
  return sourceKind.includes("semantic") || Boolean(edge?.semanticEdgeId || edge?.semanticStatus);
}

function isOverviewContextEntity(node: any): boolean {
  const type = String(node?.type || "");
  return type === "topic" || type === "service" || type === "package" || type === "diagram-group" || type === "code-area" || type === "task";
}

function trimFocusedGraphNodeIds(nodes: any[], nodeIds: Set<string>, focusedNodeId: string): Set<string> {
  const nodeById = new Map<string, any>(nodes.map((sourceNode: any) => [sourceNode.id, sourceNode]));
  const focusedType = String(nodeById.get(focusedNodeId)?.type || "");
  const leafLimit = graphFocusedLeafLimit(focusedType);
  const anchorLimit = graphFocusedAnchorLimit(focusedType);
  const anchors: string[] = [];
  const leaves: string[] = [];

  for (const nodeId of nodeIds) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    if (nodeId !== focusedNodeId && isBroadGraphTopicNode(node)) continue;
    if (nodeId === focusedNodeId || isGraphAnchorNode(node)) anchors.push(nodeId);
    else leaves.push(nodeId);
  }

  leaves.sort((leftId, rightId) => {
    const left = nodeById.get(leftId);
    const right = nodeById.get(rightId);
    return graphLeafTypeRank(String(left?.type || "")) - graphLeafTypeRank(String(right?.type || "")) ||
      String(left?.label || "").localeCompare(String(right?.label || ""));
  });

  const focusedAnchor = anchors.filter((nodeId) => nodeId === focusedNodeId);
  const relatedAnchors = anchors
    .filter((nodeId) => nodeId !== focusedNodeId)
    .sort((leftId, rightId) => {
      const left = nodeById.get(leftId);
      const right = nodeById.get(rightId);
      return graphFocusTypeRank(String(left?.type || "")) - graphFocusTypeRank(String(right?.type || "")) ||
        String(left?.label || "").localeCompare(String(right?.label || ""));
    });

  return new Set([...focusedAnchor, ...relatedAnchors.slice(0, anchorLimit), ...leaves.slice(0, leafLimit)]);
}

function isBroadGraphTopicNode(node: any): boolean {
  const id = String(node?.id || "");
  return id === "topic:backend" || id === "topic:frontend" || id === "topic:diagrams";
}

export function graphDisplayEdge(sourceEdge: any, viewMode: GraphViewMode): { source: string; target: string; label?: string } {
  const edgeType = String(sourceEdge.type || "related");
  const from = String(sourceEdge.from || "");
  const to = String(sourceEdge.to || "");

  if (edgeType === "belongs-to") {
    return {
      source: to,
      target: from,
      label: viewMode === "context" ? graphMembershipLabel(from) : undefined
    };
  }

  if ((edgeType === "supports" || edgeType === "explains" || edgeType === "mentions") && isContextEntityNodeId(to)) {
    return {
      source: to,
      target: from,
      label: edgeType === "mentions" ? "mentions" : "memory"
    };
  }

  return {
    source: from,
    target: to,
    label: graphEdgeLabel(edgeType)
  };
}

function isContextGraphEdge(edge: any): boolean {
  const edgeType = String(edge.type || "");
  if (edgeType !== "belongs-to") return true;
  const from = String(edge.from || "");
  const to = String(edge.to || "");
  return to.startsWith("project:") && (from.startsWith("repo:") || from.startsWith("workstream:"));
}

function graphNeighborhoodNodeIds(edges: any[], focusedNodeId: string, maxDistance: number): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const visited = new Set<string>([focusedNodeId]);
  const queue: Array<{ id: string; distance: number }> = [{ id: focusedNodeId, distance: 0 }];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.distance >= maxDistance) continue;
    for (const next of adjacency.get(current.id) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push({ id: next, distance: current.distance + 1 });
    }
  }
  return visited;
}

export function getGraphFocusOptions(graph: any): GraphFocusOption[] {
  const nodes: any[] = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges: any[] = Array.isArray(graph?.edges) ? graph.edges.filter((sourceEdge: any) => isContextGraphEdge(sourceEdge)) : [];
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }

  return nodes
    .filter((sourceNode: any) => isGraphFocusableNode(sourceNode) && (degree.get(sourceNode.id) || 0) > 0)
    .map((sourceNode: any): GraphFocusOption => ({
      id: sourceNode.id,
      label: `${sourceNode.label} (${graphNodeTypeLabel(sourceNode.type)}, ${degree.get(sourceNode.id) || 0})`,
      type: String(sourceNode.type || ""),
      degree: degree.get(sourceNode.id) || 0
    }))
    .sort((left, right) => graphFocusTypeRank(left.type) - graphFocusTypeRank(right.type) || right.degree - left.degree || left.label.localeCompare(right.label))
    .slice(0, 90);
}

export function isGraphAnchorNode(node: any): boolean {
  const type = String(node?.type || "");
  return [
    "project",
    "repo",
    "workstream",
    "topic",
    "service",
    "package",
    "diagram-group",
    "code-area",
    "task"
  ].includes(type);
}

export function isGraphLeafNode(node: any): boolean {
  const type = String(node?.type || "");
  return ["doc", "diagram", "file", "session", "decision", "command", "gotcha", "external-reference"].includes(type);
}

function isGraphFocusableNode(node: any): boolean {
  return isGraphFocusableNodeId(String(node?.id || ""));
}

/** Prefixes for derived context entities. Focusable nodes add `task:`. */
const CONTEXT_ENTITY_NODE_ID_PREFIXES = [
  "repo:",
  "workstream:",
  "topic:",
  "service:",
  "package:",
  "diagram-group:",
  "code-area:",
  "file:"
] as const;

export function isGraphFocusableNodeId(id: string): boolean {
  return id.startsWith("task:") || isContextEntityNodeId(id);
}

export function graphDocumentIdForGraphNode(nodeId: string, graphNode: any): string | undefined {
  const graphType = String(graphNode?.type || "");
  if (!nodeId.startsWith("doc:")) return undefined;
  if (!["doc", "diagram", "decision", "command", "gotcha"].includes(graphType)) return undefined;
  return nodeId.slice("doc:".length);
}

function isContextEntityNodeId(id: string): boolean {
  return CONTEXT_ENTITY_NODE_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/**
 * Splits a `kind:value` graph node id into its parts. `value` falls back to
 * the full id when there is no `kind:` prefix.
 */
export function parseGraphNodeId(nodeId: string): { kind: string; value: string } {
  const [kind, ...rest] = nodeId.split(":");
  return { kind, value: rest.join(":") || nodeId };
}

/** Human label for a node id; doc nodes resolve through the title map. */
export function graphNodeDisplayLabel(nodeId: string, documentTitles: Map<string, string>): string {
  const { kind, value } = parseGraphNodeId(nodeId);
  if (kind === "doc") return documentTitles.get(value) || titleCaseSlug(value.replace(/^doc-/, ""));
  if (kind === "file") return value;
  if (kind === "topic") return titleCaseSlug(value);
  return compactGraphNodeId(nodeId);
}

/** Coarse area name for grouping semantic proposal edges by endpoint. */
export function semanticGraphArea(nodeId: string): string {
  const { kind, value } = parseGraphNodeId(nodeId);
  if (kind === "doc") return "document";
  if (kind === "repo") return "repo";
  if (kind === "service") return "service";
  if (kind === "package") return "package";
  if (kind === "topic") return "topic";
  if (kind === "diagram-group") return "diagram group";
  return kind || value || "unknown";
}

/** Shortened display form of a node id for dense lists. */
export function compactGraphNodeId(nodeId: string): string {
  const { kind, value } = parseGraphNodeId(nodeId);
  if (kind === "doc") return `doc:${value.slice(0, 8)}`;
  if (kind === "repo") return value.split(/[\\/]/).filter(Boolean).pop() || value;
  return value.length > 54 ? `${value.slice(0, 51)}...` : value;
}

function graphFocusTypeRank(type: string): number {
  const ranks: Record<string, number> = {
    service: 0,
    package: 1,
    topic: 2,
    "diagram-group": 3,
    repo: 4,
    workstream: 5,
    task: 6,
    file: 7,
    session: 8,
    doc: 9
  };
  return ranks[type] ?? 20;
}

function graphLeafTypeRank(type: string): number {
  const ranks: Record<string, number> = {
    session: 0,
    decision: 1,
    diagram: 2,
    doc: 3,
    command: 4,
    gotcha: 5,
    file: 6,
    "external-reference": 7
  };
  return ranks[type] ?? 20;
}

function graphFocusedLeafLimit(type: string): number {
  if (type === "project") return 0;
  if (type === "repo") return 24;
  if (type === "topic") return 28;
  if (type === "workstream") return 24;
  if (type === "service" || type === "package" || type === "diagram-group" || type === "code-area") return 28;
  return 18;
}

function graphFocusedAnchorLimit(type: string): number {
  if (type === "repo") return 18;
  if (type === "topic") return 24;
  if (type === "service" || type === "package" || type === "diagram-group" || type === "code-area") return 12;
  return 18;
}

function graphFocusedNeighborhoodDistance(nodes: any[], focusedNodeId: string): number {
  const focusedNode = nodes.find((node) => node.id === focusedNodeId);
  const focusedType = String(focusedNode?.type || "");
  if (focusedType === "repo" || focusedType === "topic") return 2;
  return 1;
}

export function graphEdgeColor(type: string, edge?: any): string {
  const sourceKind = String(edge?.sourceKind || "");
  if (sourceKind.includes("semantic")) return edge?.semanticStatus === "proposed" ? "#8b5cf6" : "#7c3aed";
  if (type === "contains") return "#0f766e";
  if (["supports", "explains", "mentions", "uses"].includes(type)) return "#b87333";
  if (["works-on", "touched", "produced"].includes(type)) return "#c0702d";
  if (type === "contradicts") return "#b91c1c";
  if (type === "duplicates") return "#4f46e5";
  return "#8a8179";
}

export function graphNodeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "architecture-decision-record": "ADR",
    "architecture-note": "Architecture",
    "command-note": "Command",
    "diagram-group": "diagram group",
    "code-area": "code area",
    "decision-record": "Decision",
    "design-requirements-document": "Requirements",
    "external-reference": "External",
    "scratch-note": "Scratch Note",
    "technical-spec": "Spec",
    "user-flow": "User Flow"
  };
  return labels[type] || labelForSlug(type || "node");
}

function graphMembershipLabel(from: string): string {
  if (from.startsWith("repo:")) return "linked repo";
  if (from.startsWith("workstream:")) return "workstream";
  return "stored in";
}

export function getGraphStats(graph: any): { nodes: number; memberships: number; relationships: number; edgeTypes: Array<{ type: string; count: number }> } {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const memberships = edges.filter((sourceEdge: any) => sourceEdge.type === "belongs-to").length;
  const edgeTypes = summarizeEdgeTypes(edges);
  const relationships = Math.max(0, edges.length - memberships);
  return { nodes, memberships, relationships, edgeTypes };
}

export function summarizeEdgeTypes(edges: any[]): Array<{ type: string; count: number }> {
  const edgeTypeCounts = new Map<string, number>();
  for (const sourceEdge of edges) {
    edgeTypeCounts.set(sourceEdge.type, (edgeTypeCounts.get(sourceEdge.type) || 0) + 1);
  }
  return [...edgeTypeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));
}

export function summarizeNodeTypes(nodes: any[]): Array<{ type: string; count: number }> {
  const nodeTypeCounts = new Map<string, number>();
  for (const sourceNode of nodes) {
    const type = String(sourceNode.type || "node");
    nodeTypeCounts.set(type, (nodeTypeCounts.get(type) || 0) + 1);
  }
  return [...nodeTypeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));
}

export function graphEdgeLabel(type: string): string {
  const labels: Record<string, string> = {
    "belongs-to": "stored in",
    "works-on": "works on",
    touched: "touched",
    referenced: "references",
    produced: "produced",
    affects: "affects",
    supersedes: "supersedes",
    supports: "supports",
    explains: "explains",
    mentions: "mentions",
    uses: "uses",
    contains: "contains",
    "depends-on": "depends on",
    "blocked-by": "blocked by",
    related: "related",
    duplicates: "duplicates",
    contradicts: "contradicts"
  };
  return labels[type] || type;
}

export function safeGraphClassName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "node";
}
