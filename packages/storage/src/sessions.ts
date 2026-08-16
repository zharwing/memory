import type {
  Project,
  Session,
  SessionId,
  SessionSummary
} from "@zharwing/memory-core";
import type { DurableDomainEffect } from "./domain-effects.js";
import { SessionRepository } from "./repositories/session-repository.js";

export { SessionRepository } from "./repositories/session-repository.js";
export {
  SessionSummaryCache,
  type SessionSummaryFingerprint
} from "./repositories/session-summary-cache.js";

// Public function exports remain available for existing storage consumers. New
// composition roots should construct and own a SessionRepository instance.
const compatibilitySessionRepository = new SessionRepository();

export function startSession(
  args: Parameters<SessionRepository["startSession"]>[0]
): Promise<Session> {
  return compatibilitySessionRepository.startSession(args);
}

export function writeSession(
  session: Session,
  body?: string,
  ownerRoot?: string
): Promise<void> {
  return compatibilitySessionRepository.writeSession(session, body, ownerRoot);
}

export function listProjectSessions(project: Project): Promise<Session[]> {
  return compatibilitySessionRepository.listProjectSessions(project);
}

export function listProjectSessionSummaries(project: Project): Promise<SessionSummary[]> {
  return compatibilitySessionRepository.listProjectSessionSummaries(project);
}

export function getSession(
  project: Project,
  sessionId: SessionId
): Promise<Session | undefined> {
  return compatibilitySessionRepository.getSession(project, sessionId);
}

export function getActiveSession(project: Project): Promise<Session | undefined> {
  return compatibilitySessionRepository.getActiveSession(project);
}

export function getLatestSession(project: Project): Promise<Session | undefined> {
  return compatibilitySessionRepository.getLatestSession(project);
}

export function saveCheckpoint(
  args: Parameters<SessionRepository["saveCheckpoint"]>[0]
): Promise<Session> {
  return compatibilitySessionRepository.saveCheckpoint(args);
}

export function closeSession(
  args: Parameters<SessionRepository["closeSession"]>[0]
): Promise<Session> {
  return compatibilitySessionRepository.closeSession(args);
}

export function updateSessionSummary(
  args: Parameters<SessionRepository["updateSessionSummary"]>[0]
): Promise<Session> {
  return compatibilitySessionRepository.updateSessionSummary(args);
}

export function updateSessionGraphVisibility(
  args: Parameters<SessionRepository["updateSessionGraphVisibility"]>[0]
): Promise<Session> {
  return compatibilitySessionRepository.updateSessionGraphVisibility(args);
}

export function readSession(filePath: string, ownerRoot?: string): Promise<Session> {
  return compatibilitySessionRepository.readSession(filePath, ownerRoot);
}

export function readSessionSummary(
  filePath: string,
  ownerRoot?: string
): Promise<SessionSummary> {
  return compatibilitySessionRepository.readSessionSummary(filePath, ownerRoot);
}

export function assertSessionDomainEffect(
  session: Session,
  effect: DurableDomainEffect
): void {
  compatibilitySessionRepository.assertSessionDomainEffect(session, effect);
}

export function sessionDomainEffectStatus(
  session: Session,
  effect: DurableDomainEffect
): "committed" | "absent" {
  return compatibilitySessionRepository.sessionDomainEffectStatus(session, effect);
}

export function sessionDomainRevision(session: Session): string {
  return compatibilitySessionRepository.sessionDomainRevision(session);
}
