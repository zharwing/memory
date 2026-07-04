import type { ContextBundle } from "@aimem/core";
import { buildContextBundle } from "@aimem/context-engine";
import type { ProjectRegistry } from "@aimem/storage";
import {
  getSession,
  listProjectDocuments,
  listProjectSessions,
  saveContextBundle
} from "@aimem/storage";
import { resolveProject } from "./project-resolver.js";

export class ContextService {
  constructor(private readonly registry: ProjectRegistry) {}

  async previewContextBundle(params: {
    projectId: string;
    sessionId?: string;
    taskText?: string;
    requestedBy?: string;
  }): Promise<ContextBundle> {
    const project = await resolveProject(this.registry, params.projectId);
    const sessions = await listProjectSessions(project);
    const activeSession = params.sessionId
      ? await getSession(project, params.sessionId)
      : sessions.find((session) => session.status === "active") || sessions[0];
    const documents = await listProjectDocuments(project);

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
  }): Promise<ContextBundle> {
    const project = await resolveProject(this.registry, params.projectId);
    const bundle = await this.previewContextBundle(params);
    return saveContextBundle(project, bundle);
  }
}
