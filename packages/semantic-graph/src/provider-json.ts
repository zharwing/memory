import {
  clamp01 as clampConfidence,
  isDefined,
  nowIso,
  unique as uniqueStrings,
  type GraphNodeType,
  type Project,
  type SemanticDocumentExtraction,
  type SemanticGraphEdgeType,
  type SemanticGraphEvidence
} from "@zharwing/memory-core";
import { arrayValue, record, stringOrUndefined, stringValue } from "./proposals.js";
import { type SemanticExtractionPlanChunk } from "./chunking.js";
import { type SemanticExtractionPlanItem } from "./plan.js";
import { type SemanticRelationshipCandidate } from "./candidates.js";
import { normalizeTextForMatch, tokenSet } from "./internal.js";

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

export function normalizeEvidence(
  evidence: Array<string | SemanticGraphEvidence> | undefined,
  candidate?: SemanticRelationshipCandidate
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
