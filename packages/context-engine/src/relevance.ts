import { tokenize, type MemoryDocument, type Session } from "@zharwing/memory-core";

export function scoreDocumentRelevance(doc: MemoryDocument, query: string, activeSession?: Session): number {
  let score = 0;
  const haystack = [
    doc.title,
    doc.type,
    doc.topics.join(" "),
    doc.relatedFiles.join(" "),
    doc.body.slice(0, 4000)
  ]
    .join(" ")
    .toLowerCase();

  for (const term of tokenize(query)) {
    if (haystack.includes(term)) score += 5;
  }

  if (doc.visibility === "ai-pinned") score += 100;
  if (doc.status === "accepted" || doc.status === "active") score += 8;
  if (doc.status === "stale" || doc.status === "archived") score -= 30;

  if (activeSession) {
    for (const file of activeSession.touchedFiles) {
      if (doc.relatedFiles.includes(file)) score += 10;
    }
    if (doc.relatedSessions.includes(activeSession.id)) score += 15;
  }

  return score;
}

export function scoreSessionRelevance(session: Session, query: string, activeSession?: Session): number {
  let score = 0;
  const haystack = [
    session.taskTitle,
    session.goal,
    session.summary,
    session.branch,
    session.touchedFiles.join(" "),
    session.nextSteps.join(" "),
    session.blockers.join(" ")
  ]
    .join(" ")
    .toLowerCase();

  for (const term of tokenize(query)) {
    if (haystack.includes(term)) score += 5;
  }

  if (session.status === "active") score += 20;
  if (session.nextSteps.length > 0) score += 8;
  if (activeSession?.branch && session.branch === activeSession.branch) score += 7;
  if (activeSession?.id === session.id) score += 100;

  return score;
}
