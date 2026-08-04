import {
  type GraphNode,
  type ProjectGraph,
  type SemanticDocumentExtraction,
  type SemanticGraphEdge
} from "@zharwing/memory-core";
import { type SemanticExtractionPlanChunk } from "./chunking.js";
import { type SemanticExtractionPlanItem } from "./plan.js";
import { type SemanticRelationshipCandidate } from "./candidates.js";

export interface SemanticPromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SemanticJudgementPromptInput {
  source: SemanticDocumentExtraction;
  candidate: SemanticRelationshipCandidate;
  targetSummary?: string;
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
