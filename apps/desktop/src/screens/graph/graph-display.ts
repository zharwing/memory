export type GraphViewMode = "context" | "all";

export interface GraphFocusOption {
  id: string;
  label: string;
  type: string;
  degree: number;
}

const GRAPH_DISPLAY_STOPWORDS = new Set(["imported", "markdown", "markdown-memory", "memory", "readme"]);
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

    const category = graphSlug(segments[0]);
    if (category && !GRAPH_DISPLAY_STOPWORDS.has(category)) {
      const topicNode = graphDisplayNode(projectId, "topic", category, graphLabel(category));
      addNode(topicNode);
      addEdge(doc.id, topicNode.id, "mentions", "Document path groups this memory under a topic");
    }

    const area = graphDisplayAreaFromSegments(segments);
    if (area) {
      const areaNode = graphDisplayNode(projectId, area.type, area.slug, area.label, area.path);
      addNode(areaNode);
      addEdge(doc.id, areaNode.id, doc.type === "diagram" ? "explains" : "supports", "Document path identifies this context area");

      if (category && !GRAPH_DISPLAY_STOPWORDS.has(category)) {
        addEdge(`topic:${category}`, areaNode.id, "contains", "Imported memory path groups this context area under the topic");
      }

      for (const repo of reposForDisplayArea(repos, area, category)) {
        addEdge(repo.id, areaNode.id, "contains", "Linked repo contains or owns this context area");
      }
    }

    const diagramGroup = graphDisplayDiagramGroupFromSegments(segments);
    if (diagramGroup) {
      const diagramsTopic = graphDisplayNode(projectId, "topic", "diagrams", "Diagrams");
      const groupNode = graphDisplayNode(projectId, "diagram-group", diagramGroup.slug, diagramGroup.label);
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

function graphDisplayNode(projectId: string, type: string, slug: string, label: string, path?: string): any {
  return {
    id: `${type}:${slug}`,
    projectId,
    type,
    label,
    path
  };
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
      const slug = graphSlug(String(value || "").split(/[\\/]/).filter(Boolean).pop());
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
  const normalized = String(input || "").replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  const marker = lower.lastIndexOf("/markdown-memory/");
  const memoryMarker = lower.lastIndexOf("/docs/memory/");
  const importedDocsMarker = lower.lastIndexOf("/docs/imported/");
  const importedSessionsMarker = lower.lastIndexOf("/sessions/imported/");
  let relativePath = "";
  if (marker !== -1) {
    relativePath = normalized.slice(marker + "/markdown-memory/".length);
  } else if (memoryMarker !== -1) {
    relativePath = normalized.slice(memoryMarker + "/docs/memory/".length);
  } else if (importedDocsMarker !== -1) {
    relativePath = graphStripImportedProfile(normalized.slice(importedDocsMarker + "/docs/imported/".length));
  } else if (importedSessionsMarker !== -1) {
    relativePath = graphStripImportedProfile(normalized.slice(importedSessionsMarker + "/sessions/imported/".length));
  }
  if (!relativePath) return [];
  const parts = relativePath
    .split("/")
    .map((part) => graphSlug(part.replace(/\.md$/i, "")))
    .filter(Boolean);
  return parts.slice(0, -1);
}

function graphStripImportedProfile(relativePath: string): string {
  return relativePath.split("/").filter(Boolean).slice(1).join("/");
}

function graphDisplayAreaFromSegments(segments: string[]): { type: string; slug: string; label: string; path: string } | undefined {
  const [category, second, third] = segments.map(graphSlug);
  if (category === "backend") {
    const slug = graphIsBackendGroupSegment(second) && third ? third : second;
    if (!slug || GRAPH_DISPLAY_STOPWORDS.has(slug)) return undefined;
    return { type: "service", slug, label: graphLabel(slug), path: segments.join("/") };
  }
  if (category === "frontend") {
    if (!second || GRAPH_DISPLAY_STOPWORDS.has(second)) return undefined;
    return { type: "package", slug: second, label: graphLabel(second), path: segments.join("/") };
  }
  if (category === "diagrams" && second === "projects" && third) {
    return undefined;
  }
  return undefined;
}

function graphDisplayDiagramGroupFromSegments(segments: string[]): { slug: string; label: string } | undefined {
  const [category, second, third] = segments.map(graphSlug);
  if (category !== "diagrams") return undefined;
  if (second === "projects" && third) return { slug: third, label: `${graphLabel(third)} diagrams` };
  return { slug: "system", label: "System diagrams" };
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

function graphIsBackendGroupSegment(slug: string | undefined): boolean {
  return slug === "services" || slug === "backend-services" || Boolean(slug?.endsWith("-services") || slug?.endsWith("-service"));
}

function graphSlug(input: string | undefined): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/_/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function graphLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (part === "api") return "API";
      if (part === "ui") return "UI";
      if (part === "sdk") return "SDK";
      if (part === "mcp") return "MCP";
      if (part === "rbac") return "RBAC";
      if (part === "trpc") return "tRPC";
      return part.slice(0, 1).toUpperCase() + part.slice(1);
    })
    .join(" ");
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
    const selectedEdges = contextEdges.filter((sourceEdge: any) =>
      nodeIds.has(sourceEdge.from) &&
      nodeIds.has(sourceEdge.to) &&
      shouldShowFocusedGraphEdge(sourceEdge, focusedNodeId)
    );
    return { edges: selectedEdges, nodeIds };
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

  return nodeIds;
}

function isOverviewRootNode(node: any): boolean {
  const type = String(node?.type || "");
  return type === "project" || type === "repo" || type === "workstream";
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

function shouldShowFocusedGraphEdge(edge: any, focusedNodeId: string): boolean {
  const edgeType = String(edge?.type || "");
  if (edgeType === "contains" || edgeType === "belongs-to") return true;
  return edge.from === focusedNodeId || edge.to === focusedNodeId;
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

export function isGraphFocusableNodeId(id: string): boolean {
  return [
    "project:",
    "repo:",
    "workstream:",
    "topic:",
    "service:",
    "package:",
    "diagram-group:",
    "code-area:",
    "task:"
  ].some((prefix) => id.startsWith(prefix));
}

export function graphDocumentIdForGraphNode(nodeId: string, graphNode: any): string | undefined {
  const graphType = String(graphNode?.type || "");
  if (!nodeId.startsWith("doc:")) return undefined;
  if (!["doc", "diagram", "decision", "command", "gotcha"].includes(graphType)) return undefined;
  return nodeId.slice("doc:".length);
}

function isContextEntityNodeId(id: string): boolean {
  return [
    "repo:",
    "workstream:",
    "topic:",
    "service:",
    "package:",
    "diagram-group:",
    "code-area:",
    "file:"
  ].some((prefix) => id.startsWith(prefix));
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
    session: 7,
    doc: 8
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
  return labels[type] || graphLabel(type || "node");
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
