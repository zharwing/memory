import { createHash } from "node:crypto";
import {
  DEFAULT_SEMANTIC_GRAPH_SETTINGS,
  GRAPH_TOPIC_STOPWORDS,
  clamp01 as clampConfidence,
  createId,
  isDefined,
  normalizeSlug,
  nowIso,
  slugify,
  unique as uniqueStrings,
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
} from "@zharwing/memory-core";
import { applyPrivacyGate, type PrivacyDecision } from "@zharwing/memory-privacy";
import { arrayValue, record, stringOrUndefined, stringValue } from "./proposals.js";

export {
  isSemanticEvidence,
  normalizeProposalSummary,
  semanticEdgesFromProposalPatch,
  semanticEdgesProposalPatch,
  semanticProposalSummaryFromProviderJson,
  type SemanticGraphProposalPatch,
  type SemanticGraphProposalSummary
} from "./proposals.js";

export interface SemanticPromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BuildSemanticExtractionPlanInput {
  project: Project;
  documents: MemoryDocument[];
  maxDocumentChars?: number;
}

export interface SemanticExtractionPlanChunk {
  chunkId: string;
  index: number;
  headingPath: string[];
  location: string;
  startLine: number;
  endLine: number;
  content: string;
  originalCharCount: number;
  promptCharCount: number;
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
  chunks: SemanticExtractionPlanChunk[];
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

export interface SemanticJudgementPromptInput {
  source: SemanticDocumentExtraction;
  candidate: SemanticRelationshipCandidate;
  targetSummary?: string;
}

const DEFAULT_MAX_DOCUMENT_CHARS = 12000;
const MIN_CHUNK_CHARS = 1200;
const DEFAULT_MAX_CANDIDATES_PER_DOCUMENT = DEFAULT_SEMANTIC_GRAPH_SETTINGS.maxCandidatesPerDocument;
const MIN_REASON_SCORE = 1;
const HIGH_SIGNAL_SCORE = 7;

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
    const chunks = splitSemanticDocumentIntoChunks(privacy.content, maxDocumentChars);
    const promptCharCount = chunks.reduce((total, chunk) => total + chunk.promptCharCount, 0);
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
      content: chunks[0]?.content || "",
      originalCharCount: privacy.content.length,
      promptCharCount,
      truncated: false,
      redactionCount: privacy.redactions.length,
      chunks
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

  const dedupedAcceptedEdges = dedupeSemanticEdges(acceptedEdges);
  const dedupedProposedEdges = dedupeSemanticEdges(proposedEdges);
  const dedupedDryRunEdges = dedupeSemanticEdges(dryRunEdges);
  const dedupedEdgeCount =
    acceptedEdges.length + proposedEdges.length + dryRunEdges.length
    - dedupedAcceptedEdges.length - dedupedProposedEdges.length - dedupedDryRunEdges.length;

  return {
    acceptedEdges: dedupedAcceptedEdges,
    proposedEdges: dedupedProposedEdges,
    dryRunEdges: dedupedDryRunEdges,
    discardedDecisions,
    counts: {
      judged: input.decisions.length,
      accepted: dedupedAcceptedEdges.length,
      proposed: dedupedProposedEdges.length + dedupedDryRunEdges.length,
      rejected: 0,
      discarded: discardedDecisions.length + dedupedEdgeCount
    }
  };
}

export function semanticProposalSummaryMessages(input: {
  graph?: ProjectGraph;
  edges: SemanticGraphEdge[];
}): SemanticPromptMessage[] {
  const nodesById = new Map((input.graph?.nodes || []).map((node) => [node.id, node]));
  const relationships = input.edges.map((edge) => ({
    from: semanticProposalNodeLabel(edge.from, nodesById),
    to: semanticProposalNodeLabel(edge.to, nodesById),
    relationship: edge.type,
    confidence: edge.confidence,
    reason: edge.reason,
    evidence: edge.evidence.map((item) => item.quote).filter(Boolean).slice(0, 3)
  }));
  return [
    {
      role: "system",
      content: [
        "Write a short reviewer-facing summary for proposed Zharwing Memory graph relationships.",
        "Return only JSON.",
        "Use only the supplied relationships, reasons, and evidence.",
        "Do not invent facts, files, dependencies, or conclusions.",
        "Do not mention internal ids, run ids, JSON, patches, prompts, or implementation details."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        "Return this JSON object:",
        "{",
        '  "title": "short title",',
        '  "summary": "2-4 sentences explaining what the model thinks belongs together and why",',
        '  "keyRelationships": ["plain-language important relationship"],',
        '  "reviewNotes": ["anything a human should double-check; empty if none"]',
        "}",
        "",
        "Proposed relationships:",
        JSON.stringify(relationships, null, 2)
      ].join("\n")
    }
  ];
}

function semanticProposalNodeLabel(nodeId: string, nodesById: Map<string, GraphNode>): string {
  const node = nodesById.get(nodeId);
  if (node?.label) return node.label;
  const [kind, ...rest] = nodeId.split(":");
  const value = rest.join(":") || nodeId;
  if (kind === "doc") return value.replace(/^doc-/, "").replace(/[-_]+/g, " ");
  return value;
}

export function semanticExtractionMessagesForItem(item: SemanticExtractionPlanItem): SemanticPromptMessage[] {
  if (item.chunks.length === 1) {
    return semanticExtractionMessagesForChunk(item, item.chunks[0]);
  }
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

export function semanticExtractionMessagesForChunk(
  item: SemanticExtractionPlanItem,
  chunk: SemanticExtractionPlanChunk
): SemanticPromptMessage[] {
  return [
    {
      role: "system",
      content: [
        "Extract project-memory graph facts from one bounded document chunk.",
        "Return only JSON.",
        "Do not invent services, packages, files, or dependencies.",
        "Use exact names from the chunk when possible.",
        "Prefer evidence and hints that are explicit in this chunk."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        "Return this JSON object:",
        "{",
        '  "summary": "compact factual summary of this chunk",',
        '  "entities": [{"name":"exact name","kind":"service|package|topic|code-area|external-reference|unknown","nodeId":"optional graph node id","confidence":0.0}],',
        '  "concepts": ["short concept"],',
        '  "mentionedFiles": ["path or filename"],',
        '  "mentionedPackages": ["@scope/package"],',
        '  "candidateHints": [{"targetName":"exact target","targetNodeId":"optional graph node id","type":"explains|supports|mentions|uses|depends-on|related","confidence":0.0,"reason":"short reason"}]',
        "}",
        "",
        `Document title: ${item.title}`,
        `Document type: ${item.type}`,
        `Document status: ${item.status}`,
        `Document topics: ${item.topics.join(", ") || "none"}`,
        `Related files: ${item.relatedFiles.join(", ") || "none"}`,
        `Chunk: ${chunk.chunkId}`,
        `Location: ${chunk.location}`,
        "",
        chunk.content
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
        "Judge relationships between memory graph nodes, not only matching metadata.",
        "Return only JSON.",
        "Use relationship none when evidence is weak.",
        "Use relationship none when evidence only repeats generic topics or related file metadata.",
        "Do not infer beyond the supplied summaries, hints, and deterministic signals."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        "Allowed relationship values: explains, supports, mentions, uses, depends-on, duplicates, contradicts, supersedes, related, none.",
        "For doc-to-doc candidates, prefer related unless one document explicitly depends on, uses, supersedes, duplicates, or contradicts the other as a knowledge artifact.",
        "Reserve uses and depends-on for explicit dependency direction from source to target; do not use them only because the source mentions a component described by the target.",
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
        input.source.chunks?.length
          ? `Source chunk summaries: ${input.source.chunks.slice(0, 8).map((chunk) => `${chunk.chunkId} ${chunk.headingPath.join(" > ") || "document"}: ${chunk.summary}`).join(" | ")}`
          : "",
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
  chunk?: SemanticExtractionPlanChunk;
  providerId?: string;
  providerKind?: string;
  model?: string;
}): SemanticDocumentExtraction {
  const value = record(input);
  const entities = arrayValue(value.entities).map(normalizeProviderEntity).filter(isDefined).slice(0, 40);
  const concepts = arrayValue(value.concepts).map(stringValue).filter(Boolean).slice(0, 40);
  const mentionedFiles = arrayValue(value.mentionedFiles ?? value.mentioned_files).map(stringValue).filter(Boolean).slice(0, 40);
  const mentionedPackages = arrayValue(value.mentionedPackages ?? value.mentioned_packages).map(stringValue).filter(Boolean).slice(0, 40);
  const candidateHints = arrayValue(value.candidateHints ?? value.candidate_hints ?? value.relationshipHints).map(normalizeProviderHint).filter(isDefined).slice(0, 40);
  const summary = stringValue(value.summary).slice(0, 1200) || baselineSummary(args.item);
  const chunkExtraction = args.chunk
    ? {
        chunkId: args.chunk.chunkId,
        index: args.chunk.index,
        headingPath: args.chunk.headingPath,
        startLine: args.chunk.startLine,
        endLine: args.chunk.endLine,
        summary,
        entities,
        concepts,
        mentionedFiles,
        mentionedPackages,
        candidateHints
      }
    : undefined;

  return {
    version: 1,
    projectId: args.project.id,
    documentId: args.item.documentId,
    contentHash: args.item.contentHash,
    providerId: args.providerId,
    providerKind: args.providerKind,
    model: args.model,
    created: nowIso(),
    summary,
    entities,
    concepts,
    mentionedFiles,
    mentionedPackages,
    candidateHints,
    chunks: chunkExtraction ? [chunkExtraction] : undefined,
    sourceMode: args.chunk ? "chunked" : "document",
    truncated: args.item.truncated
  };
}

export function mergeSemanticDocumentExtractions(input: {
  project: Project;
  item: SemanticExtractionPlanItem;
  extractions: SemanticDocumentExtraction[];
  providerId?: string;
  providerKind?: string;
  model?: string;
}): SemanticDocumentExtraction {
  const extractions = input.extractions.filter((extraction) => extraction.documentId === input.item.documentId);
  if (extractions.length === 0) {
    return baselineSemanticExtractionFromPlanItem({
      project: input.project,
      item: input.item
    });
  }
  if (extractions.length === 1 && input.item.chunks.length <= 1) {
    return extractions[0];
  }

  const chunks = extractions
    .flatMap((extraction) => extraction.chunks || [])
    .sort((left, right) => left.index - right.index);
  const summaries = chunks.length
    ? chunks.map((chunk) => {
        const heading = chunk.headingPath.join(" > ") || `chunk ${chunk.index + 1}`;
        return `${heading}: ${chunk.summary}`;
      })
    : extractions.map((extraction) => extraction.summary);

  return {
    version: 1,
    projectId: input.project.id,
    documentId: input.item.documentId,
    contentHash: input.item.contentHash,
    providerId: input.providerId || extractions[0].providerId,
    providerKind: input.providerKind || extractions[0].providerKind,
    model: input.model || extractions[0].model,
    created: nowIso(),
    summary: summaries.join(" | ").slice(0, 1600) || baselineSummary(input.item),
    entities: mergeSemanticEntities(extractions.flatMap((extraction) => extraction.entities)).slice(0, 80),
    concepts: uniqueStrings(extractions.flatMap((extraction) => extraction.concepts)).slice(0, 80),
    mentionedFiles: uniqueStrings(extractions.flatMap((extraction) => extraction.mentionedFiles)).slice(0, 80),
    mentionedPackages: uniqueStrings(extractions.flatMap((extraction) => extraction.mentionedPackages)).slice(0, 80),
    candidateHints: mergeSemanticCandidateHints(extractions.flatMap((extraction) => extraction.candidateHints)).slice(0, 80),
    chunks,
    sourceMode: "chunked",
    truncated: input.item.truncated
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
  const fullChunkText = input.item.chunks.map((chunk) => chunk.content).join("\n\n");
  const sample = fullChunkText.slice(0, 2400);
  const packages = packageNamesForText(fullChunkText);
  const chunkSummaries = input.item.chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    index: chunk.index,
    headingPath: chunk.headingPath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    summary: baselineChunkSummary(chunk),
    entities: [] as SemanticDocumentExtraction["entities"],
    concepts: baselineConceptsForText(`${chunk.headingPath.join(" ")} ${chunk.content}`),
    mentionedFiles: [],
    mentionedPackages: packageNamesForText(chunk.content),
    candidateHints: [] as SemanticDocumentExtraction["candidateHints"]
  }));
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
      ...packages
    ]).map((name) => ({
      name,
      kind: graphNodeTypeForBaselineName(name)
    })),
    concepts: baselineConcepts(input.item),
    mentionedFiles: input.item.relatedFiles,
    mentionedPackages: packages,
    candidateHints: [],
    chunks: chunkSummaries,
    sourceMode: "baseline",
    truncated: input.item.truncated
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

export function splitSemanticDocumentIntoChunks(input: string, maxChunkChars = DEFAULT_MAX_DOCUMENT_CHARS): SemanticExtractionPlanChunk[] {
  const targetMaxChars = Math.max(MIN_CHUNK_CHARS, maxChunkChars);
  const lines = input.split(/\r?\n/);
  const sections = markdownSections(lines);
  const chunks: SemanticExtractionPlanChunk[] = [];

  for (const section of sections) {
    const sectionChunks = splitSectionLines(section.lines, section.startLine, targetMaxChars);
    for (const sectionChunk of sectionChunks) {
      const content = sectionChunk.lines.join("\n").trim();
      if (!content) continue;
      chunks.push({
        chunkId: `chunk-${String(chunks.length + 1).padStart(4, "0")}`,
        index: chunks.length,
        headingPath: section.headingPath,
        location: chunkLocation(section.headingPath, sectionChunk.startLine, sectionChunk.endLine),
        startLine: sectionChunk.startLine,
        endLine: sectionChunk.endLine,
        content,
        originalCharCount: content.length,
        promptCharCount: content.length
      });
    }
  }

  if (chunks.length > 0) return chunks;
  return [
    {
      chunkId: "chunk-0001",
      index: 0,
      headingPath: [],
      location: "lines 1-1",
      startLine: 1,
      endLine: 1,
      content: "",
      originalCharCount: 0,
      promptCharCount: 0
    }
  ];
}

function markdownSections(lines: string[]): Array<{ headingPath: string[]; startLine: number; lines: string[] }> {
  const sections: Array<{ headingPath: string[]; startLine: number; lines: string[] }> = [];
  const headingPath: string[] = [];
  let current: { headingPath: string[]; startLine: number; lines: string[] } = {
    headingPath: [],
    startLine: 1,
    lines: []
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading && current.lines.some((candidate) => candidate.trim())) {
      sections.push(current);
      const level = heading[1].length;
      headingPath.splice(level - 1);
      headingPath[level - 1] = heading[2].trim();
      current = {
        headingPath: headingPath.filter(Boolean),
        startLine: lineNumber,
        lines: [line]
      };
      return;
    }

    if (heading) {
      const level = heading[1].length;
      headingPath.splice(level - 1);
      headingPath[level - 1] = heading[2].trim();
      current.headingPath = headingPath.filter(Boolean);
    }
    current.lines.push(line);
  });

  if (current.lines.some((line) => line.trim())) sections.push(current);
  return sections;
}

function splitSectionLines(
  lines: string[],
  baseStartLine: number,
  maxChunkChars: number
): Array<{ startLine: number; endLine: number; lines: string[] }> {
  const chunks: Array<{ startLine: number; endLine: number; lines: string[] }> = [];
  let currentLines: string[] = [];
  let currentStartLine = baseStartLine;
  let currentCharCount = 0;

  lines.forEach((line, index) => {
    const lineNumber = baseStartLine + index;
    const nextLineLength = line.length + 1;
    if (currentLines.length > 0 && currentCharCount + nextLineLength > maxChunkChars) {
      chunks.push({
        startLine: currentStartLine,
        endLine: lineNumber - 1,
        lines: currentLines
      });
      currentLines = [];
      currentCharCount = 0;
      currentStartLine = lineNumber;
    }

    if (line.length > maxChunkChars) {
      if (currentLines.length > 0) {
        chunks.push({
          startLine: currentStartLine,
          endLine: lineNumber - 1,
          lines: currentLines
        });
        currentLines = [];
        currentCharCount = 0;
      }
      for (let offset = 0; offset < line.length; offset += maxChunkChars) {
        chunks.push({
          startLine: lineNumber,
          endLine: lineNumber,
          lines: [line.slice(offset, offset + maxChunkChars)]
        });
      }
      currentStartLine = lineNumber + 1;
      return;
    }

    if (currentLines.length === 0) currentStartLine = lineNumber;
    currentLines.push(line);
    currentCharCount += nextLineLength;
  });

  if (currentLines.length > 0) {
    chunks.push({
      startLine: currentStartLine,
      endLine: currentStartLine + currentLines.length - 1,
      lines: currentLines
    });
  }
  return chunks;
}

function chunkLocation(headingPath: string[], startLine: number, endLine: number): string {
  const heading = headingPath.length ? `${headingPath.join(" > ")}; ` : "";
  return `${heading}lines ${startLine}-${endLine}`;
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

function dedupeSemanticEdges(edges: SemanticGraphEdge[]): SemanticGraphEdge[] {
  const byKey = new Map<string, SemanticGraphEdge>();
  for (const edge of edges) {
    const key = semanticEdgeDedupeKey(edge);
    const existing = byKey.get(key);
    if (!existing || edge.confidence > existing.confidence || edge.evidence.length > existing.evidence.length) {
      byKey.set(key, edge);
    }
  }
  return [...byKey.values()];
}

function semanticEdgeDedupeKey(edge: Pick<SemanticGraphEdge, "from" | "to" | "type">): string {
  if (edge.type === "related" && edge.from.startsWith("doc:") && edge.to.startsWith("doc:")) {
    return `related:${[edge.from, edge.to].sort().join("<->")}`;
  }
  return `${edge.type}:${edge.from}->${edge.to}`;
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

function baselineConceptsForText(input: string): string[] {
  return [...tokenSet(normalizeTextForMatch(input))].slice(0, 12);
}

function baselineChunkSummary(chunk: SemanticExtractionPlanChunk): string {
  const firstLine = chunk.content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("Title:") && !line.startsWith("Type:") && !line.startsWith("Status:"));
  return [chunk.headingPath.join(" > "), firstLine].filter(Boolean).join(" - ").slice(0, 500);
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

function mergeSemanticEntities(
  entities: SemanticDocumentExtraction["entities"]
): SemanticDocumentExtraction["entities"] {
  const byKey = new Map<string, SemanticDocumentExtraction["entities"][number]>();
  for (const entity of entities) {
    const key = `${normalizeTextForMatch(entity.name)}\u0000${entity.kind}\u0000${entity.nodeId || ""}`;
    const existing = byKey.get(key);
    if (!existing || (entity.confidence || 0) > (existing.confidence || 0)) {
      byKey.set(key, entity);
    }
  }
  return [...byKey.values()]
    .sort((left, right) => (right.confidence || 0) - (left.confidence || 0) || left.name.localeCompare(right.name));
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

function mergeSemanticCandidateHints(
  hints: SemanticDocumentExtraction["candidateHints"]
): SemanticDocumentExtraction["candidateHints"] {
  const byKey = new Map<string, SemanticDocumentExtraction["candidateHints"][number]>();
  for (const hint of hints) {
    const key = [
      normalizeTextForMatch(hint.targetName || ""),
      hint.targetNodeId || "",
      hint.type || ""
    ].join("\u0000");
    const existing = byKey.get(key);
    if (!existing || (hint.confidence || 0) > (existing.confidence || 0)) {
      byKey.set(key, hint);
    }
  }
  return [...byKey.values()]
    .sort((left, right) => (right.confidence || 0) - (left.confidence || 0));
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

function documentNodeId(documentId: string): string {
  return `doc:${documentId}`;
}

function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeTextForMatch(input: string | undefined): string {
  return normalizeSlug(input, { strip: /@/g, mapToDash: /[_./\\]+/g, collapse: /[^a-z0-9-]+/g });
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

function normalizedStringSet(input: string[]): Set<string> {
  return new Set(input.map(normalizeTextForMatch).filter(Boolean));
}

function intersectSetCount<T>(left: Set<T>, right: T[]): number {
  return right.reduce((count, item) => count + (left.has(item) ? 1 : 0), 0);
}

