import { nowIso, slugify } from "@aimem/core";
export function buildProjectGraph(input) {
    const nodes = new Map();
    const edges = [];
    const repoReferences = [];
    const graphRules = graphRulesForProject(input.project);
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
        for (const workstreamId of doc.workstreamIds) {
            edges.push(edge(input.project.id, docNodeId, `workstream:${workstreamId}`, "supports", "Document is attached to workstream"));
        }
        for (const relatedSession of doc.relatedSessions) {
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
        edges: dedupeEdges(edges),
        generated: nowIso()
    };
}
function addNode(nodes, node) {
    if (!nodes.has(node.id))
        nodes.set(node.id, node);
}
function contextEntitiesForDocument(doc, graphRules = []) {
    const entities = new Map();
    for (const topic of doc.topics) {
        const entity = entityForTopic(topic);
        if (entity)
            entities.set(entity.id, entity);
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
function structuralRelationshipsForDocument(doc) {
    const relationships = [];
    const segments = importPathSegments(doc);
    if (!segments.length)
        return relationships;
    const category = normalizeGraphSlug(segments[0]);
    if (!category)
        return relationships;
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
function entityForTopic(topic) {
    const slug = normalizeGraphSlug(topic);
    if (!slug || GRAPH_TOPIC_STOPWORDS.has(slug))
        return undefined;
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
            id: "diagram-group:system",
            type: "diagram-group",
            label: "System diagrams",
            reason: "Document is grouped with imported diagrams"
        };
    }
    return {
        id: `topic:${slug}`,
        type: "topic",
        label: labelForSlug(slug),
        reason: "Document is tagged with this topic"
    };
}
function entitiesFromImportPath(doc) {
    const segments = importPathSegments(doc);
    const entities = [];
    if (!segments.length)
        return entities;
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
    const diagramGroup = diagramGroupFromSegments(segments);
    if (diagramGroup) {
        entities.push({
            id: `diagram-group:${diagramGroup.slug}`,
            type: "diagram-group",
            label: diagramGroup.label,
            reason: "Imported memory path identifies this diagram collection"
        });
    }
    return entities;
}
function entitiesFromGraphRules(doc, rules) {
    const segments = importFullPathSegments(doc);
    if (!segments.length)
        return [];
    return rules
        .map((rule) => entityFromGraphRule(doc, rule, segments))
        .filter(isDefined);
}
function entityFromGraphRule(doc, rule, segments) {
    const patternSegments = graphRulePatternSegments(rule.match);
    if (!patternSegments.length || !graphRuleMatchesSegments(segments, patternSegments))
        return undefined;
    const nodeType = normalizeGraphRuleNodeType(readGraphRuleString(rule, "nodeType", "node_type"));
    if (!nodeType)
        return undefined;
    const defaultSegmentIndex = defaultGraphRuleSegmentIndex(patternSegments, segments);
    const slugIndex = graphRuleSegmentIndex(readGraphRuleNumber(rule, "slugFromSegment", "slug_from_segment", "segment"), segments, defaultSegmentIndex);
    const labelIndex = graphRuleSegmentIndex(readGraphRuleNumber(rule, "labelFromSegment", "label_from_segment"), segments, slugIndex);
    const configuredSlug = readGraphRuleString(rule, "slug");
    const slug = normalizeGraphSlug(configuredSlug || segments[slugIndex] || rule.label || rule.match);
    if (!slug || GRAPH_TOPIC_STOPWORDS.has(slug))
        return undefined;
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
function entityEdgeType(doc, entity) {
    if (entity.edgeType)
        return entity.edgeType;
    if (entity.type === "topic")
        return "mentions";
    if (doc.type === "diagram" || entity.type === "diagram-group")
        return "explains";
    return "supports";
}
function importPathSegments(doc) {
    const relativePath = importRelativePath(doc);
    return relativePath ? cleanGraphSegments(relativePath) : [];
}
function importFullPathSegments(doc) {
    const relativePath = importRelativePath(doc);
    return relativePath ? cleanFullGraphSegments(relativePath) : [];
}
function importRelativePath(doc) {
    const candidates = [doc.filePath, doc.importSourcePath].filter(Boolean);
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
function stripImportedProfile(relativePath) {
    return relativePath.split("/").filter(Boolean).slice(1).join("/");
}
function cleanGraphSegments(relativePath) {
    const segments = relativePath
        .split("/")
        .map((segment) => normalizeGraphSlug(segment.replace(/\.md$/i, "")))
        .filter(Boolean);
    if (segments.length && segments[segments.length - 1].includes("memory")) {
        return segments.slice(0, -1);
    }
    return segments.slice(0, -1);
}
function cleanFullGraphSegments(relativePath) {
    return relativePath
        .split("/")
        .map((segment) => normalizeGraphSlug(segment.replace(/\.(md|mdx|txt|mermaid|mmd|puml)$/i, "")))
        .filter(Boolean);
}
function primaryAreaFromSegments(segments) {
    const [category, second, third] = segments.map(normalizeGraphSlug);
    if (!category)
        return undefined;
    if (category === "backend") {
        const slug = isBackendGroupSegment(second) && third ? third : second;
        if (!slug || GRAPH_TOPIC_STOPWORDS.has(slug))
            return undefined;
        return {
            type: isServiceSlug(slug) || category === "backend" ? "service" : "code-area",
            slug,
            label: labelForSlug(slug),
            path: segments.join("/")
        };
    }
    if (category === "frontend") {
        const slug = second;
        if (!slug || GRAPH_TOPIC_STOPWORDS.has(slug))
            return undefined;
        return {
            type: "package",
            slug,
            label: labelForSlug(slug),
            path: segments.join("/")
        };
    }
    if (category === "diagrams" && second === "projects" && third) {
        return {
            type: "service",
            slug: third,
            label: labelForSlug(third),
            path: segments.join("/")
        };
    }
    return undefined;
}
function diagramGroupFromSegments(segments) {
    const [category, second, third] = segments.map(normalizeGraphSlug);
    if (category !== "diagrams")
        return undefined;
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
function packageNamesForDocument(doc) {
    const sample = `${doc.title}\n${doc.body.slice(0, 2400)}`;
    const matches = sample.match(/@[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*/gi) || [];
    return [...new Set(matches.map((match) => match.trim()))].slice(0, 4);
}
function areaNode(projectId, type, slug, label) {
    return {
        id: `${type}:${slug}`,
        projectId,
        type,
        label
    };
}
function normalizeGraphSlug(input) {
    return String(input || "")
        .trim()
        .toLowerCase()
        .replace(/['"]/g, "")
        .replace(/_/g, "-")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function labelForSlug(slug) {
    return slug
        .split("-")
        .filter(Boolean)
        .map((part) => {
        if (part === "api")
            return "API";
        if (part === "ui")
            return "UI";
        if (part === "sdk")
            return "SDK";
        if (part === "mcp")
            return "MCP";
        if (part === "rbac")
            return "RBAC";
        if (part === "trpc")
            return "tRPC";
        return part.slice(0, 1).toUpperCase() + part.slice(1);
    })
        .join(" ");
}
function graphRulesForProject(project) {
    return (Array.isArray(project.graphRules) ? project.graphRules : [])
        .map((rule) => normalizeGraphRule(rule))
        .filter(isDefined);
}
function normalizeGraphRule(input) {
    if (!input || typeof input !== "object")
        return undefined;
    const rule = input;
    const match = stringValue(rule.match);
    const nodeType = normalizeGraphRuleNodeType(stringValue(rule.nodeType) || stringValue(rule.node_type));
    if (!match || !nodeType)
        return undefined;
    const edgeType = normalizeGraphRuleEdgeType(stringValue(rule.edgeType) || stringValue(rule.edge_type));
    const normalized = {
        match,
        nodeType
    };
    const label = stringValue(rule.label);
    const topic = stringValue(rule.topic);
    const segment = numberValue(rule.segment);
    const slugFromSegment = numberValue(rule.slugFromSegment ?? rule.slug_from_segment);
    const labelFromSegment = numberValue(rule.labelFromSegment ?? rule.label_from_segment);
    if (label)
        normalized.label = label;
    if (topic)
        normalized.topic = topic;
    if (segment !== undefined)
        normalized.segment = segment;
    if (slugFromSegment !== undefined)
        normalized.slugFromSegment = slugFromSegment;
    if (labelFromSegment !== undefined)
        normalized.labelFromSegment = labelFromSegment;
    if (edgeType)
        normalized.edgeType = edgeType;
    return normalized;
}
function graphRulePatternSegments(pattern) {
    return String(pattern || "")
        .replace(/\\/g, "/")
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .map((segment) => {
        if (segment === "*" || segment === "**")
            return segment;
        return normalizeGraphSlug(segment.replace(/\.(md|mdx|txt|mermaid|mmd|puml)$/i, ""));
    })
        .filter(Boolean);
}
function graphRuleMatchesSegments(pathSegments, patternSegments) {
    let pathIndex = 0;
    let patternIndex = 0;
    while (patternIndex < patternSegments.length && pathIndex < pathSegments.length) {
        const pattern = patternSegments[patternIndex];
        if (pattern === "**")
            return true;
        if (pattern !== "*" && pattern !== pathSegments[pathIndex])
            return false;
        patternIndex += 1;
        pathIndex += 1;
    }
    return patternIndex === patternSegments.length || patternSegments.slice(patternIndex).every((segment) => segment === "**");
}
function defaultGraphRuleSegmentIndex(patternSegments, pathSegments) {
    const wildcardIndex = patternSegments.findIndex((segment) => segment === "*");
    if (wildcardIndex >= 0 && pathSegments[wildcardIndex])
        return wildcardIndex;
    if (pathSegments.length > 1)
        return pathSegments.length - 2;
    return 0;
}
function graphRuleSegmentIndex(input, pathSegments, fallback) {
    const candidate = input === undefined ? fallback : input;
    if (!Number.isFinite(candidate))
        return fallback;
    return Math.max(0, Math.min(pathSegments.length - 1, Math.trunc(candidate)));
}
function normalizeGraphRuleNodeType(input) {
    const value = normalizeGraphSlug(input);
    return GRAPH_RULE_NODE_TYPES.has(value) ? value : undefined;
}
function normalizeGraphRuleEdgeType(input) {
    const value = normalizeGraphSlug(input);
    return GRAPH_RULE_EDGE_TYPES.has(value) ? value : undefined;
}
function readGraphRuleString(rule, ...keys) {
    const record = rule;
    for (const key of keys) {
        const value = stringValue(record[key]);
        if (value)
            return value;
    }
    return undefined;
}
function readGraphRuleNumber(rule, ...keys) {
    const record = rule;
    for (const key of keys) {
        const value = numberValue(record[key]);
        if (value !== undefined)
            return value;
    }
    return undefined;
}
function stringValue(input) {
    return typeof input === "string" && input.trim() ? input.trim() : undefined;
}
function numberValue(input) {
    if (typeof input === "number" && Number.isFinite(input))
        return input;
    if (typeof input === "string" && input.trim() && Number.isFinite(Number(input)))
        return Number(input);
    return undefined;
}
function isDefined(value) {
    return value !== undefined;
}
function isServiceSlug(slug) {
    return slug.endsWith("-service") || slug.endsWith("-api") || slug.endsWith("-worker") || slug.endsWith("-gateway");
}
function isBackendGroupSegment(slug) {
    return slug === "services" || slug === "backend-services" || Boolean(slug?.endsWith("-services") || slug?.endsWith("-service"));
}
function isPackageSlug(slug) {
    return slug.endsWith("-package") || slug.endsWith("-monorepo") || slug.endsWith("-app") || slug.endsWith("-ui");
}
function matchingReposForDocument(doc, repos) {
    return matchingReposForEvidence([
        doc.filePath,
        doc.importSourcePath,
        ...doc.topics,
        ...doc.relatedFiles
    ], repos);
}
function matchingReposForSession(session, repos) {
    return matchingReposForEvidence([
        session.repoPath,
        session.workingDirectory,
        session.importSourcePath,
        ...session.touchedFiles
    ], repos);
}
function matchingReposForEvidence(evidence, repos) {
    const evidenceAliases = new Set(evidence.flatMap((value) => aliasesForText(value || "")));
    return repos.filter((repo) => hasAliasOverlap(repo.aliases, evidenceAliases));
}
function aliasesForRepo(repo) {
    return new Set([
        ...aliasesForText(repo.path.split(/[\\/]/).pop() || repo.path),
        ...aliasesForText(repo.name || ""),
        ...aliasesForText(repo.role || ""),
        ...aliasesForText(repo.description || "")
    ]);
}
function aliasesForText(input) {
    const normalized = input
        .replace(/\\/g, "/")
        .toLowerCase();
    const slug = normalized
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const tokens = slug.split("-").filter((token) => token && !GRAPH_ALIAS_STOPWORDS.has(token));
    const aliases = new Set();
    if (slug && !GRAPH_ALIAS_STOPWORDS.has(slug))
        aliases.add(slug);
    if (slug.endsWith("s") && slug.length > 4 && !GRAPH_ALIAS_STOPWORDS.has(slug.slice(0, -1))) {
        aliases.add(slug.slice(0, -1));
    }
    for (const token of tokens)
        aliases.add(token);
    for (const token of tokens) {
        if (token.endsWith("s") && token.length > 4)
            aliases.add(token.slice(0, -1));
    }
    for (let index = 0; index < tokens.length - 1; index += 1) {
        aliases.add(`${tokens[index]}-${tokens[index + 1]}`);
    }
    return [...aliases].filter((alias) => alias.length >= 3);
}
function hasAliasOverlap(left, right) {
    for (const alias of left) {
        if (right.has(alias))
            return true;
    }
    return false;
}
const GRAPH_ALIAS_STOPWORDS = new Set([
    "all",
    "and",
    "app",
    "apps",
    "code",
    "docs",
    "for",
    "monorepo",
    "repo",
    "service",
    "services",
    "source",
    "the",
    "whole",
    "work"
]);
const GRAPH_RULE_NODE_TYPES = new Set([
    "topic",
    "service",
    "package",
    "diagram-group",
    "code-area",
    "external-reference"
]);
const GRAPH_RULE_EDGE_TYPES = new Set([
    "supports",
    "explains",
    "mentions",
    "uses",
    "contains",
    "depends-on",
    "related"
]);
const GRAPH_TOPIC_STOPWORDS = new Set([
    "imported",
    "markdown",
    "markdown-memory",
    "memory",
    "readme"
]);
function edge(projectId, from, to, type, reason) {
    return {
        id: `${from}->${type}->${to}`,
        projectId,
        from,
        to,
        type,
        reason
    };
}
function dedupeEdges(edges) {
    return [...new Map(edges.map((candidate) => [candidate.id, candidate])).values()];
}
//# sourceMappingURL=index.js.map