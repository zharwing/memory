import { createHash } from "node:crypto";
import {
  nowIso,
  type ContextExcludedItem,
  type DocumentId,
  type MemoryDocument,
  type Project
} from "@zharwing/memory-core";
import { applyPrivacyGate, type PrivacyDecision } from "@zharwing/memory-privacy";
import { splitSemanticDocumentIntoChunks, type SemanticExtractionPlanChunk } from "./chunking.js";
import { DEFAULT_MAX_DOCUMENT_CHARS, documentNodeId } from "./internal.js";

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
