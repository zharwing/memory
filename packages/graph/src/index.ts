import {
  GRAPH_ALIAS_STOPWORDS,
  GRAPH_TOPIC_STOPWORDS,
  dedupeById,
  isDefined,
  nowIso,
  slugify,
  type GraphEdge,
  type GraphExtractionRule,
  type GraphNode,
  type GraphNodeType,
  type MemoryDocument,
  type Project,
  type ProjectGraph,
  type Session,
  type Workstream
} from "@zharwing/memory-core";
export {
  normalizeGraphExtractionRule,
  normalizeGraphExtractionRules,
  parseGraphExtractionRules,
  normalizeGraphRuleNodeType,
  normalizeGraphRuleEdgeType,
  readGraphRuleString,
  readGraphRuleNumber
} from "./rules.js";
export { projectGraphDomainProjection } from "./domain-projection.js";
export { labelForSlug, normalizeGraphSlug } from "./naming.js";
import {
  normalizeGraphExtractionRules,
  normalizeGraphRuleNodeType,
  normalizeGraphRuleEdgeType,
  readGraphRuleString,
  readGraphRuleNumber
} from "./rules.js";
import { labelForSlug, normalizeGraphSlug } from "./naming.js";

export interface BuildGraphInput {
  project: Project;
  sessions: Session[];
  documents: MemoryDocument[];
  workstreams?: Workstream[];
}

export function buildProjectGraph(input: BuildGraphInput): ProjectGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const repoReferences: RepoGraphReference[] = [];
  const graphRules = graphRulesForProject(input.project);
  const includedSessionIds = new Set(
    input.sessions.filter((session) => session.includeInGraph).map((session) => session.id)
  );

  addNode(nodes, {
    id: `project:${input.project.id}`,
    projectId: input.project.id,
    type: "project",
    label: input.project.name,
    path: input.project.memoryRoot
  });

  for (const repo of input.project.repos) {
    const repoId = `repo:${repo.path}`;
    addNode(nodes, {
      id: repoId,
      projectId: input.project.id,
      type: "repo",
      label: repo.path.split(/[\\/]/).pop() || repo.path,
      path: repo.path
    });
    repoReferences.push({
      id: repoId,
      path: repo.path,
      aliases: aliasesForRepo(repo)
    });
    edges.push(edge(input.project.id, repoId, `project:${input.project.id}`, "belongs-to", "Repo is linked to project"));
  }

  for (const workstream of input.workstreams || []) {
    const workstreamId = `workstream:${workstream.id}`;
    addNode(nodes, {
      id: workstreamId,
      projectId: input.project.id,
      type: "workstream",
      label: workstream.name,
      status: workstream.status,
      path: workstream.filePath
    });
    edges.push(edge(input.project.id, workstreamId, `project:${input.project.id}`, "belongs-to", "Workstream belongs to project"));
  }

  for (const session of input.sessions) {
    if (!session.includeInGraph) continue;
    const sessionId = `session:${session.id}`;
    addNode(nodes, {
      id: sessionId,
      projectId: input.project.id,
      type: "session",
      label: session.taskTitle,
      status: session.status,
      path: session.filePath
    });
    edges.push(edge(input.project.id, sessionId, `project:${input.project.id}`, "belongs-to", "Session belongs to project"));

    for (const repoReference of matchingReposForSession(session, repoReferences)) {
      edges.push(edge(input.project.id, sessionId, repoReference.id, "works-on", "Session metadata matches linked repo"));
    }

    for (const workstreamId of session.workstreamIds) {
      edges.push(edge(input.project.id, sessionId, `workstream:${workstreamId}`, "works-on", "Session is attached to workstream"));
    }

    if (session.taskTitle) {
      const taskId = `task:${session.taskTitle.toLowerCase()}`;
      addNode(nodes, {
        id: taskId,
        projectId: input.project.id,
        type: "task",
        label: session.taskTitle
      });
      edges.push(edge(input.project.id, sessionId, taskId, "works-on", "Session works on task"));
    }

    for (const file of session.touchedFiles) {
      const fileId = `file:${file}`;
      addNode(nodes, {
        id: fileId,
        projectId: input.project.id,
        type: "file",
        label: file,
        path: file
      });
      edges.push(edge(input.project.id, sessionId, fileId, "touched", "Session touched file"));
    }

    for (const docId of session.relatedDocs) {
      edges.push(edge(input.project.id, sessionId, `doc:${docId}`, "referenced", "Session references document"));
    }
  }

  for (const doc of input.documents) {
    const nodeType = doc.type === "diagram" ? "diagram" : doc.type.includes("decision") ? "decision" : doc.type === "command-note" || doc.type === "commands" ? "command" : doc.type === "gotcha" ? "gotcha" : "doc";
    const docNodeId = `doc:${doc.id}`;
    const matchedRepos = matchingReposForDocument(doc, repoReferences);
    addNode(nodes, {
      id: docNodeId,
      projectId: input.project.id,
      type: nodeType,
      label: doc.title,
      status: doc.status,
      visibility: doc.visibility,
      path: doc.filePath,
      lastVerified: doc.lastVerified
    });
    edges.push(edge(input.project.id, docNodeId, `project:${input.project.id}`, "belongs-to", "Document belongs to project"));

    for (const repoReference of matchedRepos) {
      edges.push(edge(input.project.id, docNodeId, repoReference.id, "supports", "Document topics/import path match linked repo"));
    }

    for (const entity of contextEntitiesForDocument(doc, graphRules)) {
      addNode(nodes, {
        id: entity.id,
        projectId: input.project.id,
        type: entity.type,
        label: entity.label,
        path: entity.path
      });
      edges.push(edge(input.project.id, docNodeId, entity.id, entityEdgeType(doc, entity), entity.reason));

      if (entity.parentTopic) {
        const topicSlug = normalizeGraphSlug(entity.parentTopic);
        if (topicSlug && !GRAPH_TOPIC_STOPWORDS.has(topicSlug)) {
          const topicNode = areaNode(input.project.id, "topic", topicSlug, labelForSlug(topicSlug));
          addNode(nodes, topicNode);
          edges.push(edge(input.project.id, topicNode.id, entity.id, "contains", "Project graph rule groups this context node"));
        }
      }

      for (const repoReference of matchedRepos) {
        if (entity.type === "service" || entity.type === "package" || entity.type === "code-area") {
          edges.push(edge(input.project.id, repoReference.id, entity.id, "contains", "Repo contains or owns this code area"));
        }
      }
    }

    const diagramGroup = diagramGroupFromSegments(importPathSegments(doc));
    if (diagramGroup) {
      for (const repoReference of matchedRepos) {
        edges.push(edge(input.project.id, repoReference.id, `diagram-group:${diagramGroup.slug}`, "contains", "Repo owns this diagram collection"));
      }
    }

    for (const workstreamId of doc.workstreamIds) {
      edges.push(edge(input.project.id, docNodeId, `workstream:${workstreamId}`, "supports", "Document is attached to workstream"));
    }

    for (const relatedSession of doc.relatedSessions) {
      if (!includedSessionIds.has(relatedSession)) continue;
      edges.push(edge(input.project.id, `session:${relatedSession}`, docNodeId, "referenced", "Document metadata links to session"));
    }
    for (const relatedFile of doc.relatedFiles) {
      const fileId = `file:${relatedFile}`;
      addNode(nodes, {
        id: fileId,
        projectId: input.project.id,
        type: "file",
        label: relatedFile,
        path: relatedFile
      });
      edges.push(edge(input.project.id, docNodeId, fileId, doc.type === "diagram" ? "explains" : "supports", "Document metadata links to file"));
    }
    for (const relatedDiagram of doc.relatedDiagrams) {
      edges.push(edge(input.project.id, docNodeId, `doc:${relatedDiagram}`, "uses", "Document metadata links to diagram"));
    }

    for (const relationship of structuralRelationshipsForDocument(doc)) {
      addNode(nodes, relationship.from);
      addNode(nodes, relationship.to);
      edges.push(edge(input.project.id, relationship.from.id, relationship.to.id, relationship.type, relationship.reason));
    }
  }

  return {
    projectId: input.project.id,
    nodes: [...nodes.values()],
    edges: dedupeById(edges),
    generated: nowIso()
  };
}

interface ContextEntity {
  id: string;
  type: GraphNodeType;
  label: string;
  reason: string;
  path?: string;
  edgeType?: GraphEdge["type"];
  parentTopic?: string;
}

interface StructuralRelationship {
  from: GraphNode;
  to: GraphNode;
  type: GraphEdge["type"];
  reason: string;
}

function addNode(nodes: Map<string, GraphNode>, node: GraphNode): void {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
}

function contextEntitiesForDocument(doc: MemoryDocument, graphRules: GraphExtractionRule[] = []): ContextEntity[] {
  const entities = new Map<string, ContextEntity>();

  for (const topic of doc.topics) {
    const entity = entityForTopic(topic);
    if (entity) entities.set(entity.id, entity);
  }

  for (const entity of entitiesFromImportPath(doc)) {
    entities.set(entity.id, entity);
  }

  for (const packageName of packageNamesForDocument(doc)) {
    const slug = slugify(packageName);
    entities.set(`package:${slug}`, {
      id: `package:${slug}`,
      type: "package",
      label: packageName,
      reason: "Document mentions this package name"
    });
  }

  for (const entity of entitiesFromGraphRules(doc, graphRules)) {
    entities.set(entity.id, entity);
  }

  return [...entities.values()];
}

function structuralRelationshipsForDocument(doc: MemoryDocument): StructuralRelationship[] {
  const relationships: StructuralRelationship[] = [];
  const segments = importPathSegments(doc);
  if (!segments.length) return relationships;

  const category = normalizeGraphSlug(segments[0]);
  if (!category) return relationships;

  const categoryNode = areaNode(doc.projectId, "topic", category, labelForSlug(category));
  const area = primaryAreaFromSegments(segments);
  if (area) {
    relationships.push({
      from: categoryNode,
      to: areaNode(doc.projectId, area.type, area.slug, area.label),
      type: "contains",
      reason: "Imported memory path groups this code area under the topic"
    });
  }

  const diagramGroup = diagramGroupFromSegments(segments);
  if (diagramGroup) {
    relationships.push({
      from: areaNode(doc.projectId, "topic", "diagrams", "Diagrams"),
      to: areaNode(doc.projectId, "diagram-group", diagramGroup.slug, diagramGroup.label),
      type: "contains",
      reason: "Imported diagram path groups this diagram collection"
    });
    relationships.push({
      from: areaNode(doc.projectId, "diagram-group", diagramGroup.slug, diagramGroup.label),
      to: {
        id: `doc:${doc.id}`,
        projectId: doc.projectId,
        type: doc.type === "diagram" ? "diagram" : "doc",
        label: doc.title,
        status: doc.status,
        visibility: doc.visibility,
        path: doc.filePath,
        lastVerified: doc.lastVerified
      },
      type: "contains",
      reason: "Diagram belongs to this imported diagram collection"
    });
  }

  return relationships;
}

function entityForTopic(topic: string): ContextEntity | undefined {
  const slug = normalizeGraphSlug(topic);
  if (!slug || GRAPH_TOPIC_STOPWORDS.has(slug)) return undefined;

  if (isServiceSlug(slug)) {
    return {
      id: `service:${slug}`,
      type: "service",
      label: labelForSlug(slug),
      reason: "Document topic identifies this service or backend code area"
    };
  }

  if (isPackageSlug(slug)) {
    return {
      id: `package:${slug}`,
      type: "package",
      label: labelForSlug(slug),
      reason: "Document topic identifies this package or frontend code area"
    };
  }

  if (slug === "diagrams") {
    return {
      id: "topic:diagrams",
      type: "topic",
      label: "Diagrams",
      reason: "Document is tagged with diagrams"
    };
  }

  return {
    id: `topic:${slug}`,
    type: "topic",
    label: labelForSlug(slug),
    reason: "Document is tagged with this topic"
  };
}

function entitiesFromImportPath(doc: MemoryDocument): ContextEntity[] {
  const segments = importPathSegments(doc);
  const entities: ContextEntity[] = [];
  if (!segments.length) return entities;

  const category = normalizeGraphSlug(segments[0]);
  if (category && !GRAPH_TOPIC_STOPWORDS.has(category)) {
    entities.push({
      id: `topic:${category}`,
      type: "topic",
      label: labelForSlug(category),
      reason: "Imported memory path identifies this topic"
    });
  }

  const area = primaryAreaFromSegments(segments);
  if (area) {
    entities.push({
      id: `${area.type}:${area.slug}`,
      type: area.type,
      label: area.label,
      reason: "Imported memory path identifies this code area",
      path: area.path
    });
  }

  return entities;
}

function entitiesFromGraphRules(doc: MemoryDocument, rules: GraphExtractionRule[]): ContextEntity[] {
  const segments = importFullPathSegments(doc);
  if (!segments.length) return [];
  return rules
    .map((rule) => entityFromGraphRule(doc, rule, segments))
    .filter(isDefined);
}

function entityFromGraphRule(doc: MemoryDocument, rule: GraphExtractionRule, segments: string[]): ContextEntity | undefined {
  const patternSegments = graphRulePatternSegments(rule.match);
  if (!patternSegments.length || !graphRuleMatchesSegments(segments, patternSegments)) return undefined;

  const nodeType = normalizeGraphRuleNodeType(readGraphRuleString(rule, "nodeType", "node_type"));
  if (!nodeType) return undefined;

  const defaultSegmentIndex = defaultGraphRuleSegmentIndex(patternSegments, segments);
  const slugIndex = graphRuleSegmentIndex(readGraphRuleNumber(rule, "slugFromSegment", "slug_from_segment", "segment"), segments, defaultSegmentIndex);
  const labelIndex = graphRuleSegmentIndex(readGraphRuleNumber(rule, "labelFromSegment", "label_from_segment"), segments, slugIndex);
  const configuredSlug = readGraphRuleString(rule, "slug");
  const slug = normalizeGraphSlug(configuredSlug || segments[slugIndex] || rule.label || rule.match);
  if (!slug || GRAPH_TOPIC_STOPWORDS.has(slug)) return undefined;

  const edgeType = normalizeGraphRuleEdgeType(readGraphRuleString(rule, "edgeType", "edge_type"));
  const label = rule.label?.trim() || labelForSlug(normalizeGraphSlug(segments[labelIndex] || slug));
  return {
    id: `${nodeType}:${slug}`,
    type: nodeType,
    label,
    reason: `Project graph rule matched ${rule.match}`,
    path: segments.join("/"),
    edgeType,
    parentTopic: rule.topic
  };
}

function entityEdgeType(doc: MemoryDocument, entity: ContextEntity): GraphEdge["type"] {
  if (entity.edgeType) return entity.edgeType;
  if (entity.type === "topic") return "mentions";
  if (doc.type === "diagram" || entity.type === "diagram-group") return "explains";
  return "supports";
}

function importPathSegments(doc: MemoryDocument): string[] {
  const relativePath = importRelativePath(doc);
  return relativePath ? cleanGraphSegments(relativePath) : [];
}

function importFullPathSegments(doc: MemoryDocument): string[] {
  const relativePath = importRelativePath(doc);
  return relativePath ? cleanFullGraphSegments(relativePath) : [];
}

export function importRelativePath(doc: MemoryDocument): string | undefined {
  const candidates = [doc.filePath, doc.importSourcePath].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const normalized = candidate.replace(/\\/g, "/");
    const marker = normalized.toLowerCase().lastIndexOf("/markdown-memory/");
    if (marker !== -1) {
      return normalized.slice(marker + "/markdown-memory/".length);
    }
    const memoryMarker = normalized.toLowerCase().lastIndexOf("/docs/memory/");
    if (memoryMarker !== -1) {
      return normalized.slice(memoryMarker + "/docs/memory/".length);
    }
    const importedDocsMarker = normalized.toLowerCase().lastIndexOf("/docs/imported/");
    if (importedDocsMarker !== -1) {
      return stripImportedProfile(normalized.slice(importedDocsMarker + "/docs/imported/".length));
    }
    const importedSessionsMarker = normalized.toLowerCase().lastIndexOf("/sessions/imported/");
    if (importedSessionsMarker !== -1) {
      return stripImportedProfile(normalized.slice(importedSessionsMarker + "/sessions/imported/".length));
    }
  }
  return undefined;
}

export function stripImportedProfile(relativePath: string): string {
  return relativePath.split("/").filter(Boolean).slice(1).join("/");
}

export function cleanGraphSegments(relativePath: string): string[] {
  const segments = relativePath
    .split("/")
    .map((segment) => normalizeGraphSlug(segment.replace(/\.md$/i, "")))
    .filter(Boolean);
  if (segments.length && segments[segments.length - 1].includes("memory")) {
    return segments.slice(0, -1);
  }
  return segments.slice(0, -1);
}

function cleanFullGraphSegments(relativePath: string): string[] {
  return relativePath
    .split("/")
    .map((segment) => normalizeGraphSlug(segment.replace(/\.(md|mdx|txt|mermaid|mmd|puml)$/i, "")))
    .filter(Boolean);
}

export function primaryAreaFromSegments(segments: string[]): { type: GraphNodeType; slug: string; label: string; path?: string } | undefined {
  const [category, second, third] = segments.map(normalizeGraphSlug);
  if (!category) return undefined;

  if (category === "backend") {
    const slug = isBackendGroupSegment(second) && third ? third : second;
    if (!slug || GRAPH_TOPIC_STOPWORDS.has(slug)) return undefined;
    return {
      type: isServiceSlug(slug) || category === "backend" ? "service" : "code-area",
      slug,
      label: labelForSlug(slug),
      path: segments.join("/")
    };
  }

  if (category === "frontend") {
    const slug = second;
    if (!slug || GRAPH_TOPIC_STOPWORDS.has(slug)) return undefined;
    return {
      type: "package",
      slug,
      label: labelForSlug(slug),
      path: segments.join("/")
    };
  }

  return undefined;
}

export function diagramGroupFromSegments(segments: string[]): { slug: string; label: string } | undefined {
  const [category, second, third] = segments.map(normalizeGraphSlug);
  if (category !== "diagrams") return undefined;
  if (second === "projects" && third) {
    return {
      slug: third,
      label: `${labelForSlug(third)} diagrams`
    };
  }
  return {
    slug: "system",
    label: "System diagrams"
  };
}

function packageNamesForDocument(doc: MemoryDocument): string[] {
  const sample = `${doc.title}\n${doc.body.slice(0, 2400)}`;
  const matches = sample.match(/@[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*/gi) || [];
  return [...new Set(matches.map((match) => match.trim()))].slice(0, 4);
}

export function areaNode(projectId: string, type: GraphNodeType, slug: string, label: string): GraphNode {
  return {
    id: `${type}:${slug}`,
    projectId,
    type,
    label
  };
}

function graphRulesForProject(project: Project): GraphExtractionRule[] {
  return normalizeGraphExtractionRules(project);
}

function graphRulePatternSegments(pattern: string): string[] {
  return String(pattern || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      if (segment === "*" || segment === "**") return segment;
      return normalizeGraphSlug(segment.replace(/\.(md|mdx|txt|mermaid|mmd|puml)$/i, ""));
    })
    .filter(Boolean);
}

function graphRuleMatchesSegments(pathSegments: string[], patternSegments: string[]): boolean {
  let pathIndex = 0;
  let patternIndex = 0;

  while (patternIndex < patternSegments.length && pathIndex < pathSegments.length) {
    const pattern = patternSegments[patternIndex];
    if (pattern === "**") return true;
    if (pattern !== "*" && pattern !== pathSegments[pathIndex]) return false;
    patternIndex += 1;
    pathIndex += 1;
  }

  return patternIndex === patternSegments.length || patternSegments.slice(patternIndex).every((segment) => segment === "**");
}

function defaultGraphRuleSegmentIndex(patternSegments: string[], pathSegments: string[]): number {
  const wildcardIndex = patternSegments.findIndex((segment) => segment === "*");
  if (wildcardIndex >= 0 && pathSegments[wildcardIndex]) return wildcardIndex;
  if (pathSegments.length > 1) return pathSegments.length - 2;
  return 0;
}

function graphRuleSegmentIndex(input: number | undefined, pathSegments: string[], fallback: number): number {
  const candidate = input === undefined ? fallback : input;
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(0, Math.min(pathSegments.length - 1, Math.trunc(candidate)));
}

function isServiceSlug(slug: string): boolean {
  return slug.endsWith("-service") || slug.endsWith("-api") || slug.endsWith("-worker") || slug.endsWith("-gateway");
}

function isBackendGroupSegment(slug: string | undefined): boolean {
  return slug === "services" || slug === "backend-services" || Boolean(slug?.endsWith("-services") || slug?.endsWith("-service"));
}

function isPackageSlug(slug: string): boolean {
  return slug.endsWith("-package") || slug.endsWith("-monorepo") || slug.endsWith("-app") || slug.endsWith("-ui");
}

interface RepoGraphReference {
  id: string;
  path: string;
  aliases: Set<string>;
}

function matchingReposForDocument(doc: MemoryDocument, repos: RepoGraphReference[]): RepoGraphReference[] {
  return matchingReposForEvidence(
    [
      doc.filePath,
      doc.importSourcePath,
      ...doc.topics,
      ...doc.relatedFiles
    ],
    repos
  );
}

function matchingReposForSession(session: Session, repos: RepoGraphReference[]): RepoGraphReference[] {
  return matchingReposForEvidence(
    [
      session.repoPath,
      session.workingDirectory,
      session.importSourcePath,
      ...session.touchedFiles
    ],
    repos
  );
}

function matchingReposForEvidence(evidence: Array<string | undefined>, repos: RepoGraphReference[]): RepoGraphReference[] {
  const evidenceAliases = new Set(evidence.flatMap((value) => aliasesForText(value || "")));
  return repos.filter((repo) => hasAliasOverlap(repo.aliases, evidenceAliases));
}

function aliasesForRepo(repo: Project["repos"][number]): Set<string> {
  return new Set(
    [
      ...aliasesForText(repo.path.split(/[\\/]/).pop() || repo.path),
      ...aliasesForText(repo.name || ""),
      ...aliasesForText(repo.role || ""),
      ...aliasesForText(repo.description || "")
    ]
  );
}

function aliasesForText(input: string): string[] {
  const normalized = input
    .replace(/\\/g, "/")
    .toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const tokens = slug.split("-").filter((token) => token && !GRAPH_ALIAS_STOPWORDS.has(token));
  const aliases = new Set<string>();

  if (slug && !GRAPH_ALIAS_STOPWORDS.has(slug)) aliases.add(slug);
  if (slug.endsWith("s") && slug.length > 4 && !GRAPH_ALIAS_STOPWORDS.has(slug.slice(0, -1))) {
    aliases.add(slug.slice(0, -1));
  }
  for (const token of tokens) aliases.add(token);
  for (const token of tokens) {
    if (token.endsWith("s") && token.length > 4) aliases.add(token.slice(0, -1));
  }
  for (let index = 0; index < tokens.length - 1; index += 1) {
    aliases.add(`${tokens[index]}-${tokens[index + 1]}`);
  }

  return [...aliases].filter((alias) => alias.length >= 3);
}

function hasAliasOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const alias of left) {
    if (right.has(alias)) return true;
  }
  return false;
}

function edge(projectId: string, from: string, to: string, type: GraphEdge["type"], reason: string): GraphEdge {
  return {
    id: `${from}->${type}->${to}`,
    projectId,
    from,
    to,
    type,
    reason
  };
}
