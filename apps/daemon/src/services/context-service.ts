import type { ContextBundle } from "@zharwing/memory-core";
import { buildContextBundle } from "@zharwing/memory-context-engine";
import type { DurableDomainEffect, DocumentRepository, ProjectRegistry, SessionRepository } from "@zharwing/memory-store";
import {
  saveContextBundle
} from "@zharwing/memory-store";
import { resolveProject } from "./project-resolver.js";
import { SessionAuthorityStore } from "./session-visibility.js";

export class ContextService {
  constructor(
    private readonly registry: ProjectRegistry,
    private readonly sessionAuthority: SessionAuthorityStore,
    private readonly documents: Pick<DocumentRepository, "list">,
    private readonly sessions: SessionRepository
  ) {}

  async previewContextBundle(params: {
    projectId: string;
    sessionId?: string;
    taskText?: string;
    requestedBy?: string;
  }): Promise<ContextBundle> {
    const project = await resolveProject(this.registry, params.projectId);
    const sessions = await this.sessionAuthority.applyVisibilities(project, await this.sessions.listProjectSessions(project));
    const activeSession = params.sessionId
      ? await this.sessions.getSession(project, params.sessionId)
      : sessions.find((session) => session.status === "active") || sessions[0];
    const documents = await this.documents.list(project);

    return buildContextBundle({
      project,
      activeSession,
      recentSessions: sessions.slice(0, 10),
      documents,
      taskText: params.taskText,
      requestedBy: params.requestedBy
    });
  }

  /**
   * Hardened agent preparation prevents the compatibility context engine from
   * inventing AI visibility for legacy sessions whose metadata is missing.
   */
  async previewAgentContextBundle(params: {
    projectId: string;
    sessionId?: string;
    taskText?: string;
    requestedBy?: string;
  }): Promise<ContextBundle> {
    const project = await resolveProject(this.registry, params.projectId);
    const sessions = (await this.sessionAuthority.applyVisibilities(
      project,
      await this.sessions.listProjectSessions(project)
    )).filter((session) =>
      session.visibility === "ai-eligible" || session.visibility === "ai-pinned"
    );
    const activeSession = params.sessionId
      ? sessions.find((session) => session.id === params.sessionId)
      : sessions.find((session) => session.status === "active") || sessions[0];
    const documents = await this.documents.list(project);
    return buildContextBundle({
      project,
      activeSession,
      recentSessions: sessions.slice(0, 10),
      documents,
      taskText: params.taskText,
      requestedBy: params.requestedBy
    });
  }

  async getContextBundle(params: {
    projectId: string;
    sessionId?: string;
    taskText?: string;
    requestedBy?: string;
    effect?: DurableDomainEffect;
  }): Promise<ContextBundle> {
    const project = await resolveProject(this.registry, params.projectId);
    const bundle = await this.previewContextBundle(params);
    return saveContextBundle(project, bundle, params.effect);
  }

  async getAgentContextBundle(params: {
    projectId: string;
    sessionId?: string;
    taskText?: string;
    requestedBy?: string;
    effect?: DurableDomainEffect;
  }): Promise<ContextBundle> {
    const project = await resolveProject(this.registry, params.projectId);
    const bundle = await this.previewAgentContextBundle(params);
    return saveContextBundle(project, bundle, params.effect);
  }
}
