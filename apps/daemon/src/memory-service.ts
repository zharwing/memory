import path from "node:path";
import {
  nowIso,
  type ContextBundle,
  type Project,
  type ProjectCreationPreview,
  type StartupState
} from "@aimem/core";
import {
  classifyDocumentDeterministically,
  getAssistantStatus,
  prepareReturnSummaryDeterministically,
  recommendedModels,
  summarizeSessionDeterministically
} from "@aimem/assistant-runtime";
import { buildContextBundle } from "@aimem/context-engine";
import { buildProjectGraph } from "@aimem/graph";
import { searchProjectMemory } from "@aimem/search";
import {
  ProjectRegistry,
  closeSession as storageCloseSession,
  createDocument as storageCreateDocument,
  createProjectFromPreview,
  createProjectSnapshot,
  detectProject,
  ensureProjectWorkspace,
  getActiveSession,
  getLatestSession,
  getSession,
  listProjectDocuments,
  listProjectSessions,
  listProposedUpdates,
  prepareProjectCreation,
  proposeMemoryUpdate as storageProposeMemoryUpdate,
  rebuildProjectIndex,
  saveCheckpoint,
  saveContextBundle,
  startSession,
  updateProposalStatus as storageUpdateProposalStatus,
  validateProjectWorkspace
} from "@aimem/storage";

export interface MemoryServiceOptions {
  memoryRoot: string;
}

export class MemoryService {
  readonly registry: ProjectRegistry;

  constructor(options: MemoryServiceOptions) {
    this.registry = new ProjectRegistry(options.memoryRoot);
  }

  async listProjects(): Promise<Project[]> {
    return this.registry.listProjects();
  }

  async getProject(projectId: string): Promise<Project> {
    const project = await this.registry.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    return project;
  }

  async detectProject(params: { workingDirectory: string }) {
    return detectProject({ workingDirectory: params.workingDirectory, registry: this.registry });
  }

  async getStartupState(params: { workingDirectory?: string; projectId?: string; clientName?: string }): Promise<StartupState> {
    const workingDirectory = params.workingDirectory || process.cwd();
    const detected = params.projectId
      ? undefined
      : await detectProject({ workingDirectory, registry: this.registry });
    const projectId = params.projectId || detected?.projectId;

    if (!projectId) {
      return {
        projectStatus: "unregistered",
        workingDirectory,
        repoRoot: detected?.repoRoot,
        detectedBranch: detected?.detectedBranch,
        recentSessions: [],
        recommendedAction: "offer-create-project",
        contextReadiness: "needs-project",
        safetyStatus: "clean",
        messageForClient: "This repo is not registered in AI Memory. Offer to create or link a project."
      };
    }

    const project = await this.getProject(projectId);
    const sessions = await listProjectSessions(project);
    const activeSession = await getActiveSession(project);
    const latestSession = sessions[0];
    const recommendedAction = activeSession
      ? "resume-active"
      : latestSession && project.contextPolicy.startupMode !== "always-start-new-session"
        ? "resume-latest"
        : "start-new";

    return {
      projectStatus: "resolved",
      workingDirectory,
      repoRoot: detected?.repoRoot || project.repos[0]?.path,
      detectedBranch: detected?.detectedBranch,
      project,
      activeSession,
      latestSession,
      recentSessions: sessions.slice(0, 10),
      recommendedAction,
      contextReadiness: activeSession || latestSession ? "ready" : "needs-session",
      safetyStatus: "clean",
      messageForClient: `Resolved AI Memory project ${project.name}.`
    };
  }

  async prepareProjectCreation(params: {
    workingDirectory: string;
    projectName?: string;
    createPointerFile?: boolean;
    bootstrapFiles?: string[];
  }): Promise<ProjectCreationPreview> {
    return prepareProjectCreation({
      workingDirectory: params.workingDirectory,
      projectName: params.projectName,
      createPointerFile: params.createPointerFile,
      bootstrapFiles: params.bootstrapFiles,
      registry: this.registry
    });
  }

  async createProject(params: { preview: ProjectCreationPreview }): Promise<Project> {
    return createProjectFromPreview({
      preview: params.preview,
      registry: this.registry,
      forceWithoutConfirmation: true
    });
  }

  async getProjectSummary(params: { projectId: string }) {
    const project = await this.getProject(params.projectId);
    const sessions = await listProjectSessions(project);
    const docs = await listProjectDocuments(project);
    const inbox = await listProposedUpdates(project);
    const warnings = await validateProjectWorkspace(project);

    return {
      project,
      latestSession: sessions[0],
      activeSession: sessions.find((session) => session.status === "active"),
      counts: {
        sessions: sessions.length,
        documents: docs.length,
        diagrams: docs.filter((doc) => doc.type === "diagram").length,
        pendingInbox: inbox.filter((item) => item.status === "pending").length,
        warnings: warnings.length
      },
      warnings
    };
  }

  async ensureProject(params: { projectId: string }): Promise<Project> {
    const project = await this.getProject(params.projectId);
    await ensureProjectWorkspace(project);
    return project;
  }

  async startSession(params: {
    projectId: string;
    repoPath?: string;
    workingDirectory?: string;
    branch?: string;
    agent?: string;
    client?: string;
    taskTitle: string;
    goal?: string;
  }) {
    const project = await this.getProject(params.projectId);
    return startSession({
      project,
      repoPath: params.repoPath || project.repos[0]?.path || process.cwd(),
      workingDirectory: params.workingDirectory || process.cwd(),
      branch: params.branch,
      agent: params.agent,
      client: params.client,
      taskTitle: params.taskTitle,
      goal: params.goal
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
    const project = await this.getProject(params.projectId);
    const active = await getActiveSession(project);
    if (active && !params.taskTitle) return active;

    return this.startSession({
      projectId: params.projectId,
      workingDirectory: params.workingDirectory,
      branch: params.branch,
      agent: params.agent,
      client: params.client,
      taskTitle: params.taskTitle || "Untitled session",
      goal: params.goal
    });
  }

  async listSessions(params: { projectId: string; limit?: number }) {
    const project = await this.getProject(params.projectId);
    const sessions = await listProjectSessions(project);
    return sessions.slice(0, params.limit || sessions.length);
  }

  async getActiveSession(params: { projectId: string }) {
    return getActiveSession(await this.getProject(params.projectId));
  }

  async getLatestSession(params: { projectId: string }) {
    return getLatestSession(await this.getProject(params.projectId));
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
    const project = await this.getProject(params.projectId);
    return saveCheckpoint({ project, ...params });
  }

  async closeSession(params: { projectId: string; sessionId: string; summary?: string; nextSteps?: string[] }) {
    const project = await this.getProject(params.projectId);
    return storageCloseSession({ project, ...params });
  }

  async listDocuments(params: { projectId: string }) {
    return listProjectDocuments(await this.getProject(params.projectId));
  }

  async createDocument(params: {
    projectId: string;
    title: string;
    type: Parameters<typeof storageCreateDocument>[0]["type"];
    body: string;
    visibility?: Parameters<typeof storageCreateDocument>[0]["visibility"];
    topics?: string[];
    relatedFiles?: string[];
  }) {
    const project = await this.getProject(params.projectId);
    return storageCreateDocument({ project, ...params });
  }

  async previewContextBundle(params: {
    projectId: string;
    sessionId?: string;
    taskText?: string;
    requestedBy?: string;
  }): Promise<ContextBundle> {
    const project = await this.getProject(params.projectId);
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
    const project = await this.getProject(params.projectId);
    const bundle = await this.previewContextBundle(params);
    return saveContextBundle(project, bundle);
  }

  async search(params: { projectId: string; query: string }) {
    const project = await this.getProject(params.projectId);
    return searchProjectMemory({
      projectId: project.id,
      sessions: await listProjectSessions(project),
      documents: await listProjectDocuments(project),
      proposals: await listProposedUpdates(project)
    }, params.query);
  }

  async proposeMemoryUpdate(params: {
    projectId: string;
    type: Parameters<typeof storageProposeMemoryUpdate>[0]["type"];
    sourceSession?: string;
    sourceAgent?: string;
    sourceKind: Parameters<typeof storageProposeMemoryUpdate>[0]["sourceKind"];
    confidence?: Parameters<typeof storageProposeMemoryUpdate>[0]["confidence"];
    affectedFiles?: string[];
    targetDocument?: string;
    proposedPatch: string;
    reason: string;
  }) {
    const project = await this.getProject(params.projectId);
    return storageProposeMemoryUpdate({ ...params, project });
  }

  async listInbox(params: { projectId: string }) {
    return listProposedUpdates(await this.getProject(params.projectId));
  }

  async updateInboxStatus(params: {
    projectId: string;
    proposalId: string;
    status: Parameters<typeof storageUpdateProposalStatus>[0]["status"];
    editedPatch?: string;
  }) {
    const project = await this.getProject(params.projectId);
    return storageUpdateProposalStatus({ project, ...params });
  }

  async getGraph(params: { projectId: string }) {
    const project = await this.getProject(params.projectId);
    return buildProjectGraph({
      project,
      sessions: await listProjectSessions(project),
      documents: await listProjectDocuments(project)
    });
  }

  async backupProject(params: { projectId: string }) {
    return createProjectSnapshot(await this.getProject(params.projectId));
  }

  async validateProject(params: { projectId: string }) {
    return validateProjectWorkspace(await this.getProject(params.projectId));
  }

  async rebuildIndex(params: { projectId: string }) {
    return rebuildProjectIndex(await this.getProject(params.projectId));
  }

  async assistantStatus(params: { projectId: string }) {
    const project = await this.getProject(params.projectId);
    return {
      ...getAssistantStatus(project),
      recommendedModels: recommendedModels()
    };
  }

  async summarizeSession(params: { projectId: string; sessionId: string }) {
    const project = await this.getProject(params.projectId);
    const session = await getSession(project, params.sessionId);
    if (!session) throw new Error(`Session not found: ${params.sessionId}`);
    const draft = summarizeSessionDeterministically(session);
    return storageProposeMemoryUpdate({
      project,
      type: "session-summary",
      sourceSession: session.id,
      sourceAgent: "local-memory-assistant",
      sourceKind: "memory-assistant",
      confidence: draft.confidence,
      proposedPatch: draft.patch,
      reason: draft.reason
    });
  }

  async prepareReturnSummary(params: { projectId: string }) {
    const project = await this.getProject(params.projectId);
    const draft = prepareReturnSummaryDeterministically(await listProjectSessions(project));
    return storageProposeMemoryUpdate({
      project,
      type: "session-summary",
      sourceAgent: "local-memory-assistant",
      sourceKind: "memory-assistant",
      confidence: draft.confidence,
      proposedPatch: draft.patch,
      reason: draft.reason
    });
  }

  async classifyDocument(params: { projectId: string; documentId: string }) {
    const project = await this.getProject(params.projectId);
    const docs = await listProjectDocuments(project);
    const doc = docs.find((candidate) => candidate.id === params.documentId);
    if (!doc) throw new Error(`Document not found: ${params.documentId}`);
    const draft = classifyDocumentDeterministically(doc);
    return storageProposeMemoryUpdate({
      project,
      type: "doc-update",
      sourceAgent: "local-memory-assistant",
      sourceKind: "memory-assistant",
      confidence: draft.confidence,
      targetDocument: doc.id,
      proposedPatch: draft.patch,
      reason: draft.reason
    });
  }

  async exportProjectManifest(params: { projectId: string }) {
    const project = await this.getProject(params.projectId);
    return {
      exported: nowIso(),
      project,
      sessions: await listProjectSessions(project),
      documents: (await listProjectDocuments(project)).map(({ body, ...doc }) => doc),
      inbox: await listProposedUpdates(project)
    };
  }

  memoryRoot(): string {
    return this.registry.memoryRoot;
  }
}
