import { createHash } from "node:crypto";
import {
  createId,
  nowIso,
  slugify,
  type ContextExcludedItem,
  type DocumentId,
  type GraphEdge,
  type GraphNode,
  type GraphNodeType,
  type MemoryDocument,
  type Project,
  type ProjectGraph,
  type SemanticDocumentExtraction,
  type SemanticGraphEdge,
  type SemanticGraphEdgeStatus,
  type SemanticGraphEdgeType,
  type SemanticGraphEvidence,
  type SemanticGraphRun,
  type SemanticGraphRunCounts,
  type SemanticGraphSettings
} from "@aimem/core";
import { applyPrivacyGate, type PrivacyDecision } from "@aimem/privacy";

export interface SemanticPromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BuildSemanticExtractionPlanInput {
  project: Project;
  documents: MemoryDocument[];
  maxDocumentChars?: number;
}

export interface SemanticExtractionPlanItem {
  documentId: DocumentId;
  nodeId: string;
  title: string;
  type: MemoryDocument["type"];
  status: MemoryDocument["status"];
  visibility: MemoryDocument["visibility"];
  topics: string[];
  relatedFiles: string[];
  filePath: string;
  updated: string;
  contentHash: string;
  content: string;
  originalCharCount: number;
  promptCharCount: number;
  truncated: boolean;
  redactionCount: number;
}

export interface SemanticExtractionPlan {
  projectId: string;
  generated: string;
  documents: SemanticExtractionPlanItem[];
  excluded: ContextExcludedItem[];
  counts: {
    total: number;
    eligible: number;
    excluded: number;
    redacted: number;
  };
}

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

export type SemanticRelationshipDecisionType = SemanticGraphEdgeType | "none";

export interface SemanticRelationshipDecision {
  candidateId?: string;
  from?: string;
  to?: string;
  type: SemanticRelationshipDecisionType;
  confidence: number;
  reason: string;
  evidence?: Array<string | SemanticGraphEvidence>;
  deterministicEdgeId?: string;
}

export interface ApplySemanticEdgePolicyInput {
  project: Project;
  settings: SemanticGraphSettings;
  run: Pick<SemanticGraphRun, "id" | "mode" | "providerId" | "providerKind" | "model">;
  candidates?: SemanticRelationshipCandidate[];
  decisions: SemanticRelationshipDecision[];
  sourceAgent?: string;
  promptVersion?: string;
}

export interface SemanticEdgePolicyResult {
  acceptedEdges: SemanticGraphEdge[];
  proposedEdges: SemanticGraphEdge[];
  dryRunEdges: SemanticGraphEdge[];
  discardedDecisions: SemanticRelationshipDecision[];
  counts: Pick<
    SemanticGraphRunCounts,
    "judged" | "accepted" | "proposed" | "discarded" | "rejected"
  >;
}

export interface SemanticGraphProposalPatch {
  kind: "semantic-graph-edges";
  runId: string;
  edges: Array<{
    from: string;
    to: string;
    type: SemanticGraphEdgeType;
    confidence: number;
    reason: string;
    evidence: SemanticGraphEvidence[];
  }>;
}

export interface SemanticJudgementPromptInput {
  source: SemanticDocumentExtraction;
  candidate: SemanticRelationshipCandidate;
  targetSummary?: string;
}

const DEFAULT_MAX_DOCUMENT_CHARS = 12000;
const DEFAULT_MAX_CANDIDATES_PER_DOCUMENT = 12;
const MIN_REASON_SCORE = 1;
const HIGH_SIGNAL_SCORE = 7;
const GRAPH_TOPIC_STOPWORDS = new Set([
  "docs",
  "doc",
  "document",
  "documents",
  "memory",
  "markdown",
  "imported",
  "project",
  "projects",
  "overview",
  "note",
  "notes"
]);

export function buildSemanticExtractionPlan(input: BuildSemanticExtractionPlanInput): SemanticExtractionPlan {
  const maxDocumentChars = input.maxDocumentChars || DEFAULT_MAX_DOCUMENT_CHARS;
  const documents: SemanticExtractionPlanItem[] = [];
  const excluded: ContextExcludedItem[] = [];
  let redacted = 0;

  for (const doc of input.documents) {
    const candidateContent = semanticDocumentPromptContent(doc);
    const privacy = applyPrivacyGate(
      {
        id: doc.id,
        projectId: doc.projectId,
        type: doc.type,
        title: doc.title,
        sourcePath: doc.filePath,
        visibility: doc.visibility,
        content: candidateContent
      },
      input.project.privacyPolicy
    );

    if (!privacy.allowed) {
      if (privacy.excluded) excluded.push(privacy.excluded);
      continue;
    }

    if (privacy.redactions.length > 0) redacted += 1;
    const content = truncateForPrompt(privacy.content, maxDocumentChars);
    documents.push({
      documentId: doc.id,
      nodeId: documentNodeId(doc.id),
      title: doc.title,
      type: doc.type,
      status: doc.status,
      visibility: doc.visibility,
      topics: doc.topics,
      relatedFiles: doc.relatedFiles,
      filePath: doc.filePath,
      updated: doc.updated,
      contentHash: semanticDocumentContentHash(doc, privacy),
      content: content.value,
      originalCharCount: privacy.content.length,
      promptCharCount: content.value.length,
      truncated: content.truncated,
      redactionCount: privacy.redactions.length
    });
  }

  return {
    projectId: input.project.id,
    generated: nowIso(),
    documents,
    excluded,
    counts: {
      total: input.documents.length,
      eligible: documents.length,
      excluded: excluded.length,
      redacted
    }
  };
}

export function semanticDocumentContentHash(doc: MemoryDocument, privacy?: PrivacyDecision): string {
  const content = privacy?.content ?? semanticDocumentPromptContent(doc);
  return createHash("sha256")
    .update(
      [
        doc.id,
        doc.title,
        doc.type,
        doc.status,
        doc.visibility,
        doc.topics.join("\n"),
        doc.relatedFiles.join("\n"),
        content
      ].join("\n---\n")
    )
    .digest("hex");
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

    const sorted = [...candidates.values()]
      .filter((candidate) => candidate.score >= MIN_REASON_SCORE)
      .sort((a, b) => b.score - a.score || a.targetLabel.localeCompare(b.targetLabel))
      .slice(0, maxCandidatesPerDocument)
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

export function applySemanticEdgePolicy(input: ApplySemanticEdgePolicyInput): SemanticEdgePolicyResult {
  const candidates = new Map((input.candidates || []).map((candidate) => [candidate.id, candidate]));
  const acceptedEdges: SemanticGraphEdge[] = [];
  const proposedEdges: SemanticGraphEdge[] = [];
  const dryRunEdges: SemanticGraphEdge[] = [];
  const discardedDecisions: SemanticRelationshipDecision[] = [];

  for (const decision of input.decisions) {
    const confidence = clampConfidence(decision.confidence);
    if (decision.type === "none" || confidence < input.settings.discardBelowThreshold) {
      discardedDecisions.push({ ...decision, confidence });
      continue;
    }
    if (!decision.reason.trim() || !hasUsableEvidence(decision.evidence)) {
      discardedDecisions.push({ ...decision, confidence });
      continue;
    }

    const candidate = decision.candidateId ? candidates.get(decision.candidateId) : undefined;
    const from = decision.from || candidate?.sourceNodeId;
    const to = decision.to || candidate?.targetNodeId;
    if (!from || !to) {
      discardedDecisions.push({ ...decision, confidence });
      continue;
    }

    const edge = semanticEdgeFromDecision({
      project: input.project,
      run: input.run,
      decision: { ...decision, confidence },
      candidate,
      from,
      to,
      status: "proposed",
      sourceAgent: input.sourceAgent,
      promptVersion: input.promptVersion
    });

    if (input.run.mode === "dry-run") {
      dryRunEdges.push(edge);
      continue;
    }

    if (input.run.mode === "auto" && confidence >= input.settings.autoAcceptThreshold) {
      acceptedEdges.push({
        ...edge,
        status: "auto-accepted"
      });
      continue;
    }

    const proposalFloor =
      input.run.mode === "review"
        ? input.settings.discardBelowThreshold
        : input.settings.reviewThreshold;
    if (confidence >= proposalFloor) {
      proposedEdges.push(edge);
    } else {
      discardedDecisions.push({ ...decision, confidence });
    }
  }

  return {
    acceptedEdges,
    proposedEdges,
    dryRunEdges,
    discardedDecisions,
    counts: {
      judged: input.decisions.length,
      accepted: acceptedEdges.length,
      proposed: proposedEdges.length + dryRunEdges.length,
      rejected: 0,
      discarded: discardedDecisions.length
    }
  };
}

export function semanticEdgesProposalPatch(runId: string, edges: SemanticGraphEdge[]): string {
  const patch: SemanticGraphProposalPatch = {
    kind: "semantic-graph-edges",
    runId,
    edges: edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      type: edge.type,
      confidence: edge.confidence,
      reason: edge.reason,
      evidence: edge.evidence
    }))
  };
  return `${JSON.stringify(patch, null, 2)}\n`;
}

export function semanticEdgesFromProposalPatch(proposedPatch: string | undefined): SemanticGraphProposalPatch | undefined {
  if (!proposedPatch?.trim()) return undefined;
  try {
    const parsed = JSON.parse(proposedPatch) as Partial<SemanticGraphProposalPatch>;
    if (parsed.kind !== "semantic-graph-edges" || !Array.isArray(parsed.edges)) return undefined;
    const edges = parsed.edges
      .map((edge) => ({
        from: String(edge?.from || ""),
        to: String(edge?.to || ""),
        type: edge?.type as SemanticGraphEdgeType,
        confidence: clampConfidence(Number(edge?.confidence)),
        reason: String(edge?.reason || ""),
        evidence: Array.isArray(edge?.evidence) ? edge.evidence.filter(isSemanticEvidence) : []
      }))
      .filter((edge) => edge.from && edge.to && edge.type && edge.reason);
    if (edges.length === 0) return undefined;
    return {
      kind: "semantic-graph-edges",
      runId: String(parsed.runId || "external-semantic-run"),
      edges
    };
  } catch {
    return undefined;
  }
}

export function semanticExtractionMessagesForItem(item: SemanticExtractionPlanItem): SemanticPromptMessage[] {
  return [
    {
      role: "system",
      content: [
        "Extract project-memory graph facts from one document.",
        "Return only JSON.",
        "Do not invent services, packages, files, or dependencies.",
        "Use exact names from the document when possible."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        "Return this JSON object:",
        "{",
        '  "summary": "compact factual summary",',
        '  "entities": [{"name":"exact name","kind":"service|package|topic|code-area|external-reference|unknown","nodeId":"optional graph node id","confidence":0.0}],',
        '  "concepts": ["short concept"],',
        '  "mentionedFiles": ["path or filename"],',
        '  "mentionedPackages": ["@scope/package"],',
        '  "candidateHints": [{"targetName":"exact target","targetNodeId":"optional graph node id","type":"explains|supports|mentions|uses|depends-on|related","confidence":0.0,"reason":"short reason"}]',
        "}",
        "",
        item.content
      ].join("\n")
    }
  ];
}

export function semanticJudgementMessages(input: SemanticJudgementPromptInput): SemanticPromptMessage[] {
  return [
    {
      role: "system",
      content: [
        "Judge whether a real project-memory relationship exists.",
        "Return only JSON.",
        "Use relationship none when evidence is weak.",
        "Do not infer beyond the supplied summaries, hints, and deterministic signals."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        "Allowed relationship values: explains, supports, mentions, uses, depends-on, duplicates, contradicts, supersedes, related, none.",
        "Return this JSON object:",
        "{",
        '  "relationship": "explains|supports|mentions|uses|depends-on|duplicates|contradicts|supersedes|related|none",',
        '  "confidence": 0.0,',
        '  "reason": "short reason",',
        '  "evidence": ["short evidence snippet"]',
        "}",
        "",
        `Source document: ${input.source.documentId}`,
        `Source summary: ${input.source.summary}`,
        `Source entities: ${input.source.entities.map((entity) => `${entity.name} (${entity.kind})`).join(", ") || "none"}`,
        `Source concepts: ${input.source.concepts.join(", ") || "none"}`,
        "",
        `Candidate: ${input.candidate.targetNodeId}`,
        `Candidate label: ${input.candidate.targetLabel}`,
        `Candidate type: ${input.candidate.targetType}`,
        `Suggested type: ${input.candidate.suggestedType}`,
        `Candidate reasons: ${input.candidate.reasons.join("; ") || "none"}`,
        input.targetSummary ? `Target summary: ${input.targetSummary}` : ""
      ].filter(Boolean).join("\n")
    }
  ];
}

export function semanticExtractionFromProviderJson(input: unknown, args: {
  project: Project;
  item: SemanticExtractionPlanItem;
  providerId?: string;
  providerKind?: string;
  model?: string;
}): SemanticDocumentExtraction {
  const value = record(input);
  return {
    version: 1,
    projectId: args.project.id,
    documentId: args.item.documentId,
    contentHash: args.item.contentHash,
    providerId: args.providerId,
    providerKind: args.providerKind,
    model: args.model,
    created: nowIso(),
    summary: stringValue(value.summary).slice(0, 1200) || baselineSummary(args.item),
    entities: arrayValue(value.entities).map(normalizeProviderEntity).filter(isDefined).slice(0, 40),
    concepts: arrayValue(value.concepts).map(stringValue).filter(Boolean).slice(0, 40),
    mentionedFiles: arrayValue(value.mentionedFiles ?? value.mentioned_files).map(stringValue).filter(Boolean).slice(0, 40),
    mentionedPackages: arrayValue(value.mentionedPackages ?? value.mentioned_packages).map(stringValue).filter(Boolean).slice(0, 40),
    candidateHints: arrayValue(value.candidateHints ?? value.candidate_hints ?? value.relationshipHints).map(normalizeProviderHint).filter(isDefined).slice(0, 40)
  };
}

export function semanticDecisionFromProviderJson(input: unknown, candidateId?: string): SemanticRelationshipDecision {
  const value = record(input);
  const type = normalizeDecisionType(stringValue(value.relationship ?? value.type));
  return {
    candidateId,
    type,
    confidence: clampConfidence(Number(value.confidence ?? 0)),
    reason: stringValue(value.reason).slice(0, 1200),
    evidence: arrayValue(value.evidence).map((item) => {
      if (typeof item === "string") return item.slice(0, 1000);
      const evidence = record(item);
      return {
        documentId: stringOrUndefined(evidence.documentId ?? evidence.document_id),
        quote: stringValue(evidence.quote).slice(0, 1000),
        location: stringOrUndefined(evidence.location),
        sourcePath: stringOrUndefined(evidence.sourcePath ?? evidence.source_path)
      };
    }).filter((item) => typeof item === "string" ? item : item.quote)
  };
}

export function baselineSemanticExtractionFromPlanItem(input: {
  project: Project;
  item: SemanticExtractionPlanItem;
}): SemanticDocumentExtraction {
  const sample = input.item.content.slice(0, 2400);
  return {
    version: 1,
    projectId: input.project.id,
    documentId: input.item.documentId,
    contentHash: input.item.contentHash,
    providerKind: "manual",
    model: "metadata-baseline",
    created: nowIso(),
    summary: baselineSummary(input.item),
    entities: uniqueStrings([
      ...input.item.topics,
      ...packageNamesForText(sample)
    ]).map((name) => ({
      name,
      kind: graphNodeTypeForBaselineName(name)
    })),
    concepts: baselineConcepts(input.item),
    mentionedFiles: input.item.relatedFiles,
    mentionedPackages: packageNamesForText(sample),
    candidateHints: []
  };
}

function semanticDocumentPromptContent(doc: MemoryDocument): string {
  return [
    `Title: ${doc.title}`,
    `Type: ${doc.type}`,
    `Status: ${doc.status}`,
    `Topics: ${doc.topics.join(", ") || "none"}`,
    `Related files: ${doc.relatedFiles.join(", ") || "none"}`,
    "",
    doc.body
  ].join("\n");
}

function truncateForPrompt(input: string, maxChars: number): { value: string; truncated: boolean } {
  if (input.length <= maxChars) {
    return { value: input, truncated: false };
  }
  return {
    value: `${input.slice(0, Math.max(0, maxChars - 36)).trimEnd()}\n\n[truncated for semantic analysis]`,
    truncated: true
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

function baselineSummary(item: SemanticExtractionPlanItem): string {
  const firstBodyLine = item.content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("Title:") && !line.startsWith("Type:") && !line.startsWith("Status:"));
  return [item.title, firstBodyLine].filter(Boolean).join(" - ").slice(0, 500);
}

function baselineConcepts(item: SemanticExtractionPlanItem): string[] {
  const tokens = tokenSet(`${normalizeTextForMatch(item.title)} ${item.topics.map(normalizeTextForMatch).join(" ")}`);
  return [...tokens].slice(0, 16);
}

function packageNamesForText(input: string): string[] {
  const matches = input.match(/@[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*/gi) || [];
  return uniqueStrings(matches.map((match) => match.trim())).slice(0, 12);
}

function graphNodeTypeForBaselineName(name: string): GraphNodeType | "unknown" {
  const normalized = normalizeTextForMatch(name);
  if (name.startsWith("@") || name.includes("/")) return "package";
  if (normalized.includes("service")) return "service";
  if (normalized.includes("diagram")) return "diagram-group";
  if (normalized) return "topic";
  return "unknown";
}

function normalizeProviderEntity(input: unknown): SemanticDocumentExtraction["entities"][number] | undefined {
  const value = record(input);
  const name = stringValue(value.name).slice(0, 200);
  if (!name) return undefined;
  return {
    name,
    kind: normalizeProviderNodeKind(stringValue(value.kind)),
    nodeId: stringOrUndefined(value.nodeId ?? value.node_id),
    confidence: value.confidence === undefined ? undefined : clampConfidence(Number(value.confidence))
  };
}

function normalizeProviderHint(input: unknown): SemanticDocumentExtraction["candidateHints"][number] | undefined {
  const value = record(input);
  const targetName = stringOrUndefined(value.targetName ?? value.target_name ?? value.target);
  const targetNodeId = stringOrUndefined(value.targetNodeId ?? value.target_node_id);
  if (!targetName && !targetNodeId) return undefined;
  const normalizedType = normalizeDecisionType(stringValue(value.type));
  return {
    targetName,
    targetNodeId,
    type: normalizedType === "none" ? undefined : normalizedType,
    confidence: value.confidence === undefined ? undefined : clampConfidence(Number(value.confidence)),
    reason: stringOrUndefined(value.reason)
  };
}

function normalizeProviderNodeKind(input: string): GraphNodeType | "unknown" {
  const allowed = new Set<GraphNodeType | "unknown">([
    "project",
    "repo",
    "workstream",
    "topic",
    "service",
    "package",
    "diagram-group",
    "task",
    "session",
    "decision",
    "doc",
    "diagram",
    "code-area",
    "file",
    "command",
    "gotcha",
    "external-reference",
    "unknown"
  ]);
  return allowed.has(input as GraphNodeType | "unknown") ? input as GraphNodeType | "unknown" : "unknown";
}

function normalizeDecisionType(input: string): SemanticRelationshipDecisionType {
  const normalized = input.trim().toLowerCase();
  const allowed = new Set<SemanticRelationshipDecisionType>([
    "explains",
    "supports",
    "mentions",
    "uses",
    "depends-on",
    "duplicates",
    "contradicts",
    "supersedes",
    "related",
    "none"
  ]);
  return allowed.has(normalized as SemanticRelationshipDecisionType) ? normalized as SemanticRelationshipDecisionType : "none";
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

function semanticEdgeFromDecision(input: {
  project: Project;
  run: Pick<SemanticGraphRun, "id" | "providerId" | "providerKind" | "model">;
  decision: SemanticRelationshipDecision;
  candidate?: SemanticRelationshipCandidate;
  from: string;
  to: string;
  status: SemanticGraphEdgeStatus;
  sourceAgent?: string;
  promptVersion?: string;
}): SemanticGraphEdge {
  const now = nowIso();
  return {
    id: createId("sem-edge"),
    projectId: input.project.id,
    from: input.from,
    to: input.to,
    type: input.decision.type === "none" ? "related" : input.decision.type,
    status: input.status,
    confidence: clampConfidence(input.decision.confidence),
    reason: input.decision.reason,
    evidence: normalizeEvidence(input.decision.evidence, input.candidate),
    source: {
      kind: "llm",
      providerId: input.run.providerId,
      providerKind: input.run.providerKind,
      model: input.run.model,
      runId: input.run.id,
      sourceAgent: input.sourceAgent,
      promptVersion: input.promptVersion
    },
    created: now,
    updated: now,
    deterministicEdgeId:
      input.decision.deterministicEdgeId || input.candidate?.deterministicEdgeIds[0]
  };
}

function normalizeEvidence(
  evidence: Array<string | SemanticGraphEvidence> | undefined,
  candidate: SemanticRelationshipCandidate | undefined
): SemanticGraphEvidence[] {
  return (evidence || []).map((item) => {
    if (typeof item === "string") {
      return {
        documentId: candidate?.sourceDocumentId,
        quote: item
      };
    }
    return {
      documentId: item.documentId || candidate?.sourceDocumentId,
      quote: item.quote,
      location: item.location,
      sourcePath: item.sourcePath
    };
  });
}

function hasUsableEvidence(evidence: Array<string | SemanticGraphEvidence> | undefined): boolean {
  return (evidence || []).some((item) => typeof item === "string" ? Boolean(item.trim()) : Boolean(item.quote.trim()));
}

function isSemanticEvidence(input: unknown): input is SemanticGraphEvidence {
  return Boolean(input && typeof input === "object" && typeof (input as SemanticGraphEvidence).quote === "string");
}

function documentNodeId(documentId: string): string {
  return `doc:${documentId}`;
}

function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeTextForMatch(input: string | undefined): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/@/g, "")
    .replace(/[_./\\]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeIdForMatch(input: string | undefined): string {
  const raw = String(input || "");
  const value = raw.includes(":") ? raw.split(":").slice(1).join(":") : raw;
  return normalizeTextForMatch(value);
}

function tokensForNode(node: GraphNode): string[] {
  return [...tokenSet(`${normalizeIdForMatch(node.id)} ${normalizeTextForMatch(node.label)}`)];
}

function tokenSet(input: string): Set<string> {
  return new Set(
    input
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !GRAPH_TOPIC_STOPWORDS.has(token))
  );
}

function intersectCount(left: Set<string>, right: string[]): number {
  return right.reduce((count, token) => count + (left.has(token) ? 1 : 0), 0);
}

function uniqueStrings(input: string[]): string[] {
  return [...new Set(input.filter(Boolean))];
}

function normalizedStringSet(input: string[]): Set<string> {
  return new Set(input.map(normalizeTextForMatch).filter(Boolean));
}

function intersectSetCount<T>(left: Set<T>, right: T[]): number {
  return right.reduce((count, item) => count + (left.has(item) ? 1 : 0), 0);
}

function clampConfidence(input: number): number {
  if (Number.isNaN(input)) return 0;
  return Math.max(0, Math.min(1, input));
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function record(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

function arrayValue(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function stringValue(input: unknown): string {
  return String(input || "").trim();
}

function stringOrUndefined(input: unknown): string | undefined {
  const value = stringValue(input);
  return value || undefined;
}
