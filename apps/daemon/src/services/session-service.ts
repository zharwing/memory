import type { ProjectRegistry } from "@aimem/storage";
import {
  closeSession as storageCloseSession,
  getActiveSession,
  getLatestSession,
  getSession,
  listProjectSessions,
  movePathToTrash,
  saveCheckpoint,
  startSession
} from "@aimem/storage";
import { resolveProject } from "./project-resolver.js";

export class SessionService {
  constructor(private readonly registry: ProjectRegistry) {}

  async startSession(params: {
    projectId: string;
    repoPath?: string;
    workingDirectory?: string;
    branch?: string;
    agent?: string;
    client?: string;
    taskTitle?: string;
    goal?: string;
    workstreamIds?: string[];
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    return startSession({
      project,
      repoPath: params.repoPath || project.repos[0]?.path || process.cwd(),
      workingDirectory: params.workingDirectory || process.cwd(),
      branch: params.branch,
      agent: params.agent,
      client: params.client,
      taskTitle: params.taskTitle?.trim() || undefined,
      goal: params.goal,
      workstreamIds: params.workstreamIds
    });
  }

  async startOrResumeSession(params: {
    projectId: string;
    taskTitle?: string;
    workingDirectory?: string;
    branch?: string;
    agent?: string;
    client?: string;
    goal?: string;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const active = await getActiveSession(project);
    if (active && !params.taskTitle) return active;

    return this.startSession({
      projectId: params.projectId,
      workingDirectory: params.workingDirectory,
      branch: params.branch,
      agent: params.agent,
      client: params.client,
      taskTitle: params.taskTitle?.trim() || undefined,
      goal: params.goal
    });
  }

  async listSessions(params: { projectId: string; limit?: number }) {
    const project = await resolveProject(this.registry, params.projectId);
    const sessions = await listProjectSessions(project);
    return sessions.slice(0, params.limit || sessions.length);
  }

  async getActiveSession(params: { projectId: string }) {
    return getActiveSession(await resolveProject(this.registry, params.projectId));
  }

  async getLatestSession(params: { projectId: string }) {
    return getLatestSession(await resolveProject(this.registry, params.projectId));
  }

  async saveCheckpoint(params: {
    projectId: string;
    sessionId: string;
    summary: string;
    nextSteps?: string[];
    blockers?: string[];
    touchedFiles?: string[];
    proposedUpdateIds?: string[];
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    return saveCheckpoint({ project, ...params });
  }

  async closeSession(params: { projectId: string; sessionId: string; summary?: string; nextSteps?: string[] }) {
    const project = await resolveProject(this.registry, params.projectId);
    return storageCloseSession({ project, ...params });
  }

  async deleteSession(params: { projectId: string; sessionId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const session = await getSession(project, params.sessionId);
    if (!session?.filePath) throw new Error(`Session not found: ${params.sessionId}`);
    return movePathToTrash({
      memoryRoot: this.registry.memoryRoot,
      type: "session",
      projectId: project.id,
      projectName: project.name,
      itemId: session.id,
      title: session.taskTitle,
      originalPath: session.filePath,
      critical: session.status === "active",
      details: { status: session.status }
    });
  }
}
