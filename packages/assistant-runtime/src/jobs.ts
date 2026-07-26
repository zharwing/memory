import { normalizeSlug, type MemoryDocument, type Session } from "@zharwing/memory-core";
import type { AiChatMessage } from "./openai-compatible.js";

export interface AssistantDraft {
  title: string;
  patch: string;
  reason: string;
  confidence: "low" | "medium" | "high";
}

export interface SessionSummaryDraft {
  summary: string;
  topics: string[];
  nextSteps: string[];
  blockers: string[];
  touchedFiles: string[];
  confidence: "low" | "medium" | "high";
}

export function sessionSummaryMessages(session: Session, content?: string): AiChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You summarize Zharwing Memory project sessions for future search and recall.",
        "Return only JSON.",
        "Do not invent facts. Prefer compact, durable project context over transcript narration."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        "Summarize this session as JSON with this shape:",
        "{",
        '  "summary": "2-4 factual sentences describing what this work session was about and what changed",',
        '  "topics": ["short searchable tags, lowercase when natural"],',
        '  "nextSteps": ["remaining concrete follow-up items"],',
        '  "blockers": ["current blockers, or empty array"],',
        '  "touchedFiles": ["important repo-relative file paths, or empty array"],',
        '  "confidence": "low|medium|high"',
        "}",
        "",
        `Task: ${session.taskTitle}`,
        session.goal ? `Goal: ${session.goal}` : "",
        `Status: ${session.status}`,
        `Started: ${session.started}`,
        `Updated: ${session.updated}`,
        session.closed ? `Closed: ${session.closed}` : "",
        session.summary ? `Existing summary: ${session.summary}` : "",
        session.nextSteps.length ? `Existing next steps: ${session.nextSteps.join(" | ")}` : "",
        session.blockers.length ? `Existing blockers: ${session.blockers.join(" | ")}` : "",
        session.touchedFiles.length ? `Touched files: ${session.touchedFiles.join(" | ")}` : "",
        "",
        "Session content:",
        truncateSessionContent(content ?? session.body ?? "", 14000)
      ].filter(Boolean).join("\n")
    }
  ];
}

export function sessionSummaryFromProviderJson(input: unknown, session: Session): SessionSummaryDraft {
  const value = objectValue(input);
  const summary = stringValue(value.summary).slice(0, 1600).trim();
  if (!summary) throw new Error("Provider did not return a session summary.");
  return {
    summary,
    topics: arrayValue(value.topics).map(stringValue).map(normalizeTag).filter(Boolean).slice(0, 12),
    nextSteps: arrayValue(value.nextSteps ?? value.next_steps).map(stringValue).filter(Boolean).slice(0, 12),
    blockers: arrayValue(value.blockers).map(stringValue).filter(Boolean).slice(0, 12),
    touchedFiles: arrayValue(value.touchedFiles ?? value.touched_files).map(stringValue).filter(Boolean).slice(0, 40),
    confidence: confidenceValue(value.confidence, session.summary ? "medium" : "low")
  };
}

export function summarizeSessionMetadataDeterministically(session: Session): SessionSummaryDraft {
  const facts = [
    session.goal ? `Goal: ${session.goal}` : "",
    session.touchedFiles.length ? `Touched files: ${session.touchedFiles.slice(0, 8).join(", ")}.` : "",
    session.blockers.length ? `Blockers: ${session.blockers.slice(0, 5).join("; ")}.` : "",
    session.nextSteps.length ? `Next steps: ${session.nextSteps.slice(0, 5).join("; ")}.` : ""
  ].filter(Boolean);
  const summary = [
    session.summary || `${session.taskTitle} (${session.status}).`,
    ...facts
  ].join(" ").trim();

  return {
    summary,
    topics: deterministicSessionTopics(session),
    nextSteps: session.nextSteps,
    blockers: session.blockers,
    touchedFiles: session.touchedFiles,
    confidence: session.summary ? "medium" : "low"
  };
}

export function summarizeSessionDeterministically(session: Session): AssistantDraft {
  const patch = `## Session Summary: ${session.taskTitle}

Status: ${session.status}
Updated: ${session.updated}

Summary:
${session.summary || "No explicit summary was recorded."}

Touched files:
${session.touchedFiles.map((file) => `- ${file}`).join("\n") || "- None recorded"}

Blockers:
${session.blockers.map((blocker) => `- ${blocker}`).join("\n") || "- None recorded"}

Next steps:
${session.nextSteps.map((step) => `- ${step}`).join("\n") || "- None recorded"}
`;

  return {
    title: `Summary for ${session.taskTitle}`,
    patch,
    reason: "Deterministic summary from session metadata.",
    confidence: session.summary ? "high" : "medium"
  };
}

export function prepareReturnSummaryDeterministically(sessions: Session[]): AssistantDraft {
  const recent = sessions.slice(0, 5);
  const patch = `## Return To Project Summary

Recent sessions:
${recent.map((session) => `- ${session.updated}: ${session.taskTitle} (${session.status})`).join("\n") || "- No sessions recorded"}

Open next steps:
${recent.flatMap((session) => session.nextSteps.map((step) => `- ${session.taskTitle}: ${step}`)).join("\n") || "- None recorded"}

Known blockers:
${recent.flatMap((session) => session.blockers.map((blocker) => `- ${session.taskTitle}: ${blocker}`)).join("\n") || "- None recorded"}
`;

  return {
    title: "Return to project summary",
    patch,
    reason: "Deterministic summary from recent project sessions.",
    confidence: recent.length > 0 ? "medium" : "low"
  };
}

export function classifyDocumentDeterministically(doc: MemoryDocument): AssistantDraft {
  const lowered = `${doc.title}\n${doc.body}`.toLowerCase();
  const type =
    lowered.includes("decision") || lowered.includes("adr")
      ? "architecture-decision-record"
      : lowered.includes("mermaid") || lowered.includes("sequenceDiagram") || lowered.includes("flowchart")
        ? "diagram"
        : lowered.includes("plan") || lowered.includes("milestone")
          ? "plan"
          : lowered.includes("bug") || lowered.includes("investigation")
            ? "investigation"
            : "scratch-note";

  return {
    title: `Classify ${doc.title}`,
    patch: `Suggested type: ${type}
Suggested topics: ${doc.topics.join(", ") || "none"}
Suggested visibility: ${doc.visibility}`,
    reason: "Deterministic keyword classification.",
    confidence: type === "scratch-note" ? "low" : "medium"
  };
}

function deterministicSessionTopics(session: Session): string[] {
  const words = [
    session.taskTitle,
    session.goal || "",
    session.summary || "",
    session.touchedFiles.join(" ")
  ].join(" ").toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || [];
  const stopwords = new Set(["session", "work", "with", "from", "this", "that", "about", "using", "into", "update", "updated"]);
  return [...new Set(words.map(normalizeTag).filter((word) => word && !stopwords.has(word)))].slice(0, 8);
}

function truncateSessionContent(input: string, maxChars: number): string {
  const normalized = input.trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.floor(maxChars * 0.65))}\n\n[...session content truncated...]\n\n${normalized.slice(-Math.floor(maxChars * 0.25))}`;
}

function objectValue(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

function arrayValue(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function stringValue(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function normalizeTag(input: string): string {
  // Preserves . _ / - inside tags, unlike the stricter slug variants.
  return normalizeSlug(input, { strip: /['"]/g, collapse: /[^a-z0-9._/-]+/g });
}

function confidenceValue(input: unknown, fallback: SessionSummaryDraft["confidence"]): SessionSummaryDraft["confidence"] {
  return input === "low" || input === "medium" || input === "high" ? input : fallback;
}
