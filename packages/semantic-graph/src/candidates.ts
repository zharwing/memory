import { createHash } from "node:crypto";
import {
  DEFAULT_SEMANTIC_GRAPH_SETTINGS,
  isDefined,
  nowIso,
  slugify,
  unique as uniqueStrings,
  type DocumentId,
  type GraphEdge,
  type GraphNode,
  type GraphNodeType,
  type MemoryDocument,
  type Project,
  type ProjectGraph,
  type SemanticDocumentExtraction,
  type SemanticGraphEdgeType,
  type SemanticGraphSettings
} from "@zharwing/memory-core";
import { documentNodeId, normalizeTextForMatch, tokenSet } from "./internal.js";

const DEFAULT_MAX_CANDIDATES_PER_DOCUMENT = DEFAULT_SEMANTIC_GRAPH_SETTINGS.maxCandidatesPerDocument;
const MIN_REASON_SCORE = 1;
const HIGH_SIGNAL_SCORE = 7;

export interface BuildSemanticCandidateIndexInput {
  project: Project;
  graph: ProjectGraph;
  documents: MemoryDocument[];
  extractions: SemanticDocumentExtraction[];
  settings?: Pick<SemanticGraphSettings, "maxCandidatesPerDocument">;
}

export interface SemanticRelationshipCandidate {
  id: string;
  projectId: string;
  sourceDocumentId: DocumentId;
  sourceNodeId: string;
  targetNodeId: string;
  targetLabel: string;
  targetType: GraphNodeType;
  targetPath?: string;
  suggestedType: SemanticGraphEdgeType;
  score: number;
  reasons: string[];
  deterministicEdgeIds: string[];
}

export interface SemanticDocumentCandidateSet {
  documentId: DocumentId;
  sourceNodeId: string;
  candidates: SemanticRelationshipCandidate[];
}

export interface SemanticCandidateIndex {
  projectId: string;
  generated: string;
  maxCandidatesPerDocument: number;
  documents: SemanticDocumentCandidateSet[];
  candidates: SemanticRelationshipCandidate[];
  counts: {
    documents: number;
    candidates: number;
  };
}

export function buildSemanticCandidateIndex(input: BuildSemanticCandidateIndexInput): SemanticCandidateIndex {
  const maxCandidatesPerDocument =
    input.settings?.maxCandidatesPerDocument || DEFAULT_MAX_CANDIDATES_PER_DOCUMENT;
  const nodesById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const normalizedNodes = input.graph.nodes.map((node) => ({
    node,
    normalizedId: normalizeIdForMatch(node.id),
    normalizedLabel: normalizeTextForMatch(node.label),
    tokens: tokensForNode(node)
  }));
  const edgesByDocument = deterministicEdgesByDocument(input.graph.edges);
  const docsById = new Map(input.documents.map((doc) => [doc.id, doc]));
  const documentSets: SemanticDocumentCandidateSet[] = [];

  for (const extraction of input.extractions) {
    const doc = docsById.get(extraction.documentId);
    if (!doc) continue;

    const sourceNodeId = documentNodeId(extraction.documentId);
    const candidates = new Map<string, SemanticRelationshipCandidateDraft>();

    for (const graphEdge of edgesByDocument.get(sourceNodeId) || []) {
      const targetNodeId = graphEdge.from === sourceNodeId ? graphEdge.to : graphEdge.from;
      const target = nodesById.get(targetNodeId);
      if (!target || shouldSkipTargetNode(sourceNodeId, target, graphEdge)) continue;
      addCandidateReason(candidates, input.project.id, extraction.documentId, sourceNodeId, target, {
        suggestedType: suggestedTypeFromDeterministicEdge(graphEdge),
        score: scoreForGraphEdge(graphEdge),
        reason: `deterministic graph ${graphEdge.type}: ${graphEdge.reason}`,
        deterministicEdgeId: graphEdge.id
      });
    }

    for (const entity of extraction.entities) {
      for (const target of matchingGraphNodes(entity.name, normalizedNodes, entity.nodeId)) {
        if (shouldSkipTargetNode(sourceNodeId, target)) continue;
        addCandidateReason(candidates, input.project.id, extraction.documentId, sourceNodeId, target, {
          suggestedType: typeForEntityNode(target),
          score: entity.confidence ? Math.max(2, Math.round(entity.confidence * 8)) : HIGH_SIGNAL_SCORE,
          reason: `extracted entity matches ${target.type}: ${entity.name}`
        });
      }
    }

    for (const hint of extraction.candidateHints) {
      const targets = hint.targetNodeId
        ? [nodesById.get(hint.targetNodeId)].filter(isDefined)
        : matchingGraphNodes(hint.targetName || "", normalizedNodes);
      for (const target of targets) {
        if (shouldSkipTargetNode(sourceNodeId, target)) continue;
        addCandidateReason(candidates, input.project.id, extraction.documentId, sourceNodeId, target, {
          suggestedType: hint.type || typeForEntityNode(target),
          score: hint.confidence ? Math.max(2, Math.round(hint.confidence * 8)) : 5,
          reason: hint.reason || `LLM extraction hint matches ${target.label}`
        });
      }
    }

    for (const packageName of extraction.mentionedPackages) {
      const packageNodeId = `package:${slugify(packageName)}`;
      const target = nodesById.get(packageNodeId);
      if (!target || shouldSkipTargetNode(sourceNodeId, target)) continue;
      addCandidateReason(candidates, input.project.id, extraction.documentId, sourceNodeId, target, {
        suggestedType: "uses",
        score: HIGH_SIGNAL_SCORE,
        reason: `document mentions package ${packageName}`
      });
    }

    for (const topic of doc.topics) {
      const target = nodesById.get(`topic:${slugify(topic)}`);
      if (!target || shouldSkipTargetNode(sourceNodeId, target)) continue;
      addCandidateReason(candidates, input.project.id, extraction.documentId, sourceNodeId, target, {
        suggestedType: "mentions",
        score: 4,
        reason: `document topic matches graph topic ${topic}`
      });
    }

    for (const relatedDoc of relatedDocumentCandidates(doc, extraction, input.documents, nodesById)) {
      if (shouldSkipTargetNode(sourceNodeId, relatedDoc.target)) continue;
      addCandidateReason(candidates, input.project.id, extraction.documentId, sourceNodeId, relatedDoc.target, {
        suggestedType: "related",
        score: relatedDoc.score,
        reason: relatedDoc.reason
      });
    }

    const sorted = selectSemanticRelationshipCandidates([...candidates.values()], maxCandidatesPerDocument)
      .map((candidate) => finalizeCandidate(candidate));

    documentSets.push({
      documentId: extraction.documentId,
      sourceNodeId,
      candidates: sorted
    });
  }

  const allCandidates = documentSets.flatMap((set) => set.candidates);
  return {
    projectId: input.project.id,
    generated: nowIso(),
    maxCandidatesPerDocument,
    documents: documentSets,
    candidates: allCandidates,
    counts: {
      documents: documentSets.length,
      candidates: allCandidates.length
    }
  };
}

interface SemanticRelationshipCandidateDraft {
  projectId: string;
  sourceDocumentId: DocumentId;
  sourceNodeId: string;
  targetNodeId: string;
  targetLabel: string;
  targetType: GraphNodeType;
  targetPath?: string;
  suggestedType: SemanticGraphEdgeType;
  score: number;
  reasons: string[];
  deterministicEdgeIds: string[];
}

function addCandidateReason(
  candidates: Map<string, SemanticRelationshipCandidateDraft>,
  projectId: string,
  sourceDocumentId: DocumentId,
  sourceNodeId: string,
  target: GraphNode,
  input: {
    suggestedType: SemanticGraphEdgeType;
    score: number;
    reason: string;
    deterministicEdgeId?: string;
  }
): void {
  const existing = candidates.get(target.id);
  if (existing) {
    existing.score += input.score;
    existing.reasons.push(input.reason);
    if (input.deterministicEdgeId) existing.deterministicEdgeIds.push(input.deterministicEdgeId);
    if (existing.suggestedType === "related" && input.suggestedType !== "related") {
      existing.suggestedType = input.suggestedType;
    }
    return;
  }

  candidates.set(target.id, {
    projectId,
    sourceDocumentId,
    sourceNodeId,
    targetNodeId: target.id,
    targetLabel: target.label,
    targetType: target.type,
    targetPath: target.path,
    suggestedType: input.suggestedType,
    score: input.score,
    reasons: [input.reason],
    deterministicEdgeIds: input.deterministicEdgeId ? [input.deterministicEdgeId] : []
  });
}

function finalizeCandidate(candidate: SemanticRelationshipCandidateDraft): SemanticRelationshipCandidate {
  return {
    ...candidate,
    id: createCandidateId(candidate),
    reasons: uniqueStrings(candidate.reasons).slice(0, 6),
    deterministicEdgeIds: uniqueStrings(candidate.deterministicEdgeIds)
  };
}

function selectSemanticRelationshipCandidates(
  candidates: SemanticRelationshipCandidateDraft[],
  maxCandidates: number
): SemanticRelationshipCandidateDraft[] {
  const eligible = candidates
    .filter((candidate) => candidate.score >= MIN_REASON_SCORE)
    .sort(compareSemanticCandidateDrafts);
  const relationshipCandidates = eligible.filter((candidate) => !isMetadataOnlyTarget(candidate.targetType));
  const metadataCandidates = eligible.filter((candidate) => isMetadataOnlyTarget(candidate.targetType));

  if (relationshipCandidates.length === 0) {
    return metadataCandidates.slice(0, maxCandidates);
  }

  const metadataLimit = Math.min(1, Math.max(0, maxCandidates - relationshipCandidates.length));
  return [
    ...relationshipCandidates.slice(0, maxCandidates),
    ...metadataCandidates.slice(0, metadataLimit)
  ].slice(0, maxCandidates);
}

function compareSemanticCandidateDrafts(
  left: SemanticRelationshipCandidateDraft,
  right: SemanticRelationshipCandidateDraft
): number {
  return candidateTargetPriority(right.targetType) - candidateTargetPriority(left.targetType)
    || right.score - left.score
    || left.targetLabel.localeCompare(right.targetLabel);
}

function candidateTargetPriority(type: GraphNodeType): number {
  if (type === "doc" || type === "service" || type === "package" || type === "code-area") return 4;
  if (type === "workstream" || type === "decision" || type === "session" || type === "diagram") return 3;
  if (type === "diagram-group" || type === "external-reference" || type === "gotcha" || type === "command") return 2;
  if (type === "file" || type === "topic" || type === "repo") return 1;
  return 0;
}

function isMetadataOnlyTarget(type: GraphNodeType): boolean {
  return type === "file" || type === "topic";
}

function createCandidateId(candidate: Pick<SemanticRelationshipCandidateDraft, "sourceNodeId" | "targetNodeId">): string {
  return `sem-candidate:${stableHash(`${candidate.sourceNodeId}->${candidate.targetNodeId}`).slice(0, 16)}`;
}

function deterministicEdgesByDocument(edges: GraphEdge[]): Map<string, GraphEdge[]> {
  const byDocument = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    if (edge.type === "belongs-to") continue;
    for (const endpoint of [edge.from, edge.to]) {
      if (!endpoint.startsWith("doc:")) continue;
      const list = byDocument.get(endpoint) || [];
      list.push(edge);
      byDocument.set(endpoint, list);
    }
  }
  return byDocument;
}

function suggestedTypeFromDeterministicEdge(edge: GraphEdge): SemanticGraphEdgeType {
  if (edge.type === "touched" || edge.type === "referenced" || edge.type === "produced") return "related";
  return edge.type;
}

function scoreForGraphEdge(edge: GraphEdge): number {
  if (edge.type === "explains" || edge.type === "supports" || edge.type === "uses" || edge.type === "depends-on") {
    return HIGH_SIGNAL_SCORE;
  }
  if (edge.type === "mentions" || edge.type === "related") return 4;
  return 3;
}

function matchingGraphNodes(
  name: string,
  nodes: Array<{ node: GraphNode; normalizedId: string; normalizedLabel: string; tokens: string[] }>,
  nodeId?: string
): GraphNode[] {
  if (nodeId) {
    const exact = nodes.find((entry) => entry.node.id === nodeId);
    if (exact) return [exact.node];
  }

  const normalizedName = normalizeTextForMatch(name);
  const normalizedId = normalizeIdForMatch(name);
  if (!normalizedName && !normalizedId) return [];
  const nameTokens = tokenSet(normalizedName);

  return nodes
    .filter((entry) => {
      if (entry.node.type === "project" || entry.node.type === "doc" || entry.node.type === "diagram") return false;
      if (entry.normalizedId === normalizedId || entry.normalizedLabel === normalizedName) return true;
      if (normalizedName.length > 3 && entry.normalizedLabel.includes(normalizedName)) return true;
      return intersectCount(nameTokens, entry.tokens) >= Math.min(2, nameTokens.size);
    })
    .map((entry) => entry.node)
    .slice(0, 8);
}

function shouldSkipTargetNode(sourceNodeId: string, target: GraphNode, graphEdge?: GraphEdge): boolean {
  if (target.id === sourceNodeId) return true;
  if (target.type === "project") return true;
  if (target.visibility === "never-send" || target.visibility === "private" || target.visibility === "human-only") return true;
  if (graphEdge?.type === "belongs-to") return true;
  return false;
}

function typeForEntityNode(node: GraphNode): SemanticGraphEdgeType {
  if (node.type === "package") return "uses";
  if (node.type === "service" || node.type === "code-area") return "explains";
  if (node.type === "topic" || node.type === "external-reference") return "mentions";
  return "related";
}

function relatedDocumentCandidates(
  source: MemoryDocument,
  extraction: SemanticDocumentExtraction,
  documents: MemoryDocument[],
  nodesById: Map<string, GraphNode>
): Array<{ target: GraphNode; score: number; reason: string }> {
  const sourceTopics = normalizedStringSet(source.topics);
  const sourceWorkstreams = new Set(source.workstreamIds);
  const sourceFiles = normalizedStringSet(source.relatedFiles);
  const sourceTitleTokens = tokenSet(normalizeTextForMatch(source.title));
  const conceptTokens = tokenSet(extraction.concepts.map(normalizeTextForMatch).join(" "));
  const out: Array<{ target: GraphNode; score: number; reason: string }> = [];

  for (const doc of documents) {
    if (doc.id === source.id) continue;
    if (doc.visibility === "private" || doc.visibility === "never-send" || doc.visibility === "human-only") continue;

    const target = nodesById.get(documentNodeId(doc.id));
    if (!target) continue;

    let score = 0;
    const reasons: string[] = [];
    const sharedTopics = intersectSetCount(sourceTopics, [...normalizedStringSet(doc.topics)]);
    const sharedWorkstreams = intersectSetCount(sourceWorkstreams, doc.workstreamIds);
    const sharedFiles = intersectSetCount(sourceFiles, [...normalizedStringSet(doc.relatedFiles)]);
    const titleOverlap = intersectCount(sourceTitleTokens, [...tokenSet(normalizeTextForMatch(doc.title))]);
    const conceptOverlap = intersectCount(
      conceptTokens,
      [...tokenSet(`${normalizeTextForMatch(doc.title)} ${doc.topics.map(normalizeTextForMatch).join(" ")}`)]
    );

    if (sharedTopics > 0) {
      score += Math.min(6, sharedTopics * 2);
      reasons.push(`shares ${sharedTopics} topic${sharedTopics === 1 ? "" : "s"}`);
    }
    if (sharedWorkstreams > 0) {
      score += Math.min(8, sharedWorkstreams * 4);
      reasons.push(`shares ${sharedWorkstreams} workstream${sharedWorkstreams === 1 ? "" : "s"}`);
    }
    if (sharedFiles > 0) {
      score += Math.min(8, sharedFiles * 4);
      reasons.push(`references ${sharedFiles} shared file${sharedFiles === 1 ? "" : "s"}`);
    }
    if (titleOverlap >= 2) {
      score += Math.min(5, titleOverlap);
      reasons.push(`title shares ${titleOverlap} important terms`);
    }
    if (conceptOverlap > 0) {
      score += Math.min(5, conceptOverlap * 2);
      reasons.push(`extracted concepts match target title or topics`);
    }

    if (score >= 3) {
      out.push({
        target,
        score,
        reason: `candidate document relation: ${reasons.join(", ")}`
      });
    }
  }

  return out
    .sort((a, b) => b.score - a.score || a.target.label.localeCompare(b.target.label))
    .slice(0, DEFAULT_MAX_CANDIDATES_PER_DOCUMENT);
}

function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeIdForMatch(input: string | undefined): string {
  const raw = String(input || "");
  const value = raw.includes(":") ? raw.split(":").slice(1).join(":") : raw;
  return normalizeTextForMatch(value);
}

function tokensForNode(node: GraphNode): string[] {
  return [...tokenSet(`${normalizeIdForMatch(node.id)} ${normalizeTextForMatch(node.label)}`)];
}

function intersectCount(left: Set<string>, right: string[]): number {
  return right.reduce((count, token) => count + (left.has(token) ? 1 : 0), 0);
}

function normalizedStringSet(input: string[]): Set<string> {
  return new Set(input.map(normalizeTextForMatch).filter(Boolean));
}

function intersectSetCount<T>(left: Set<T>, right: T[]): number {
  return right.reduce((count, item) => count + (left.has(item) ? 1 : 0), 0);
}
