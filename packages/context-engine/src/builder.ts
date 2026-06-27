import {
  createId,
  nowIso,
  type ContextBundle,
  type ContextExcludedItem,
  type ContextIncludedItem,
  type MemoryDocument,
  type Project,
  type Redaction,
  type SafetyStatus,
  type Session
} from "@aimem/core";
import { applyPrivacyGate, combineSafetyStatus } from "@aimem/privacy";
import { scoreDocumentRelevance, scoreSessionRelevance } from "./relevance.js";
import { estimateTokens, truncateToTokenBudget } from "./tokens.js";

export interface BuildContextInput {
  project: Project;
  activeSession?: Session;
  recentSessions: Session[];
  documents: MemoryDocument[];
  taskText?: string;
  requestedBy?: string;
}

export function buildContextBundle(input: BuildContextInput): ContextBundle {
  const bundleId = createId("bundle");
  const query = [input.taskText, input.activeSession?.taskTitle, input.activeSession?.goal]
    .filter(Boolean)
    .join(" ");
  const included: ContextIncludedItem[] = [];
  const excluded: ContextExcludedItem[] = [];
  const redactions: Redaction[] = [];
  const safetyStatuses: SafetyStatus[] = [];
  let remainingTokens = input.project.contextPolicy.maxTokens;

  const candidates = [
    ...projectCanonicalCandidates(input.project, input.documents),
    ...sessionCandidates(input),
    ...documentCandidates(input, query)
  ];

  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);

    const privacy = applyPrivacyGate(
      {
        id: candidate.id,
        projectId: input.project.id,
        type: candidate.type,
        title: candidate.title,
        sourcePath: candidate.sourcePath,
        visibility: candidate.visibility,
        content: candidate.content
      },
      input.project.privacyPolicy
    );
    safetyStatuses.push(privacy.safetyStatus);

    if (!privacy.allowed) {
      if (privacy.excluded) excluded.push(privacy.excluded);
      continue;
    }

    const tokenEstimate = estimateTokens(privacy.content);
    if (tokenEstimate > remainingTokens) {
      excluded.push({
        id: candidate.id,
        projectId: input.project.id,
        type: candidate.type,
        title: candidate.title,
        sourcePath: candidate.sourcePath,
        reason: "over-token-budget"
      });
      continue;
    }

    included.push({
      ...candidate,
      content: privacy.content,
      tokenEstimate
    });
    redactions.push(...privacy.redactions);
    remainingTokens -= tokenEstimate;
  }

  for (const doc of input.documents) {
    if (!seen.has(doc.id)) {
      excluded.push({
        id: doc.id,
        projectId: input.project.id,
        type: doc.type,
        title: doc.title,
        sourcePath: doc.filePath,
        reason: doc.status === "archived" ? "archived" : "not-selected"
      });
    }
  }

  const tokenEstimate = included.reduce((sum, item) => sum + item.tokenEstimate, 0);
  const safetyStatus = combineSafetyStatus(safetyStatuses);

  return {
    id: bundleId,
    projectId: input.project.id,
    sessionId: input.activeSession?.id,
    created: nowIso(),
    requestedBy: input.requestedBy,
    includedItems: included,
    excludedItems: excluded,
    redactions,
    tokenEstimate,
    safetyStatus,
    markdown: renderContextMarkdown(input.project.name, included, excluded, redactions, tokenEstimate)
  };
}

function projectCanonicalCandidates(project: Project, documents: MemoryDocument[]): ContextIncludedItem[] {
  const canonicalNames = new Set(["overview", "commands", "gotcha", "architecture-note", "decision-record"]);
  return documents
    .filter((doc) => canonicalNames.has(doc.type) || ["overview.md", "commands.md", "gotchas.md", "architecture.md", "decisions.md"].some((name) => doc.filePath.endsWith(name)))
    .filter((doc) => doc.status !== "archived" && doc.status !== "superseded")
    .map((doc) => docCandidate(doc, "Canonical project memory", "raw"));
}

function sessionCandidates(input: BuildContextInput): ContextIncludedItem[] {
  const allSessions = [
    ...(input.activeSession ? [input.activeSession] : []),
    ...input.recentSessions.filter((session) => session.id !== input.activeSession?.id)
  ];

  return allSessions
    .map((session) => ({
      session,
      score: scoreSessionRelevance(session, input.taskText || "", input.activeSession)
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.project.contextPolicy.maxRawSessions + input.project.contextPolicy.maxSummarizedSessions)
    .map(({ session }, index) => {
      const rawLimit = input.project.contextPolicy.maxRawSessions;
      const mode = index < rawLimit ? "raw" : "summary";
      return sessionCandidate(session, mode, index === 0 ? "Active or most relevant project session" : "Relevant recent project session");
    });
}

function documentCandidates(input: BuildContextInput, query: string): ContextIncludedItem[] {
  return input.documents
    .map((doc) => ({
      doc,
      score: scoreDocumentRelevance(doc, query, input.activeSession)
    }))
    .filter(({ doc, score }) => doc.visibility === "ai-pinned" || score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ doc }) => docCandidate(doc, doc.visibility === "ai-pinned" ? "Pinned for AI context" : "Relevant to task/session"));
}

function docCandidate(doc: MemoryDocument, reason: string, mode: "raw" | "summary" | "metadata" = "raw"): ContextIncludedItem {
  return {
    id: doc.id,
    projectId: doc.projectId,
    type: doc.type === "diagram" ? "diagram" : "document",
    title: doc.title,
    sourcePath: doc.filePath,
    visibility: doc.visibility,
    lastUpdated: doc.updated,
    lastVerified: doc.lastVerified,
    reason,
    mode,
    content: mode === "raw" ? doc.body : truncateToTokenBudget(doc.body, 1200),
    tokenEstimate: 0
  };
}

function sessionCandidate(session: Session, mode: "raw" | "summary", reason: string): ContextIncludedItem {
  const rawContent = session.body || renderSession(session);
  const content = mode === "raw"
    ? rawContent
    : session.summary || truncateToTokenBudget(rawContent, 1200);
  return {
    id: session.id,
    projectId: session.projectId,
    type: "session",
    title: session.taskTitle,
    sourcePath: session.filePath,
    visibility: "ai-eligible",
    lastUpdated: session.updated,
    reason,
    mode,
    content,
    tokenEstimate: 0
  };
}

function renderSession(session: Session): string {
  return `Task: ${session.taskTitle}
Status: ${session.status}
Branch: ${session.branch || "unknown"}
Summary: ${session.summary || "No summary recorded."}
Next steps:
${session.nextSteps.map((step) => `- ${step}`).join("\n") || "- None recorded"}
Blockers:
${session.blockers.map((blocker) => `- ${blocker}`).join("\n") || "- None recorded"}
Touched files:
${session.touchedFiles.map((file) => `- ${file}`).join("\n") || "- None recorded"}`;
}

function renderContextMarkdown(
  projectName: string,
  included: ContextIncludedItem[],
  excluded: ContextExcludedItem[],
  redactions: Redaction[],
  tokenEstimate: number
): string {
  const sections = included
    .map(
      (item) => `## ${item.title}

Type: ${item.type}
Reason: ${item.reason}
Source: ${item.sourcePath || "memory"}
Mode: ${item.mode}

${item.content}`
    )
    .join("\n\n");

  return `# AI Context for This Session

Project: ${projectName}
Estimated tokens: ${tokenEstimate}
Included items: ${included.length}
Excluded items: ${excluded.length}
Redactions: ${redactions.reduce((sum, redaction) => sum + redaction.count, 0)}

${sections}

## Exclusions

${excluded.map((item) => `- ${item.title} (${item.type}): ${item.reason}`).join("\n") || "- None"}

## Redactions

${redactions.map((item) => `- ${item.itemId}: ${item.replacement} x${item.count}`).join("\n") || "- None"}
`;
}
