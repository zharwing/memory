import type { MemoryDocument, Session } from "@aimem/core";

export interface AssistantDraft {
  title: string;
  patch: string;
  reason: string;
  confidence: "low" | "medium" | "high";
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
