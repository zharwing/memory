import path from "node:path";
import {
  DEFAULT_MEMORY_WRITE_POLICY,
  nowIso,
  type ContextBundle,
  type GraphExtractionRule,
  type GraphRuleEdgeType,
  type GraphRuleNodeType,
  type ImportConflictStrategy,
  type ImportPlan,
  type ImportProfile,
  type MemoryReviewMode,
  type Project,
  type ProjectCreationPreview,
  type RepoLink,
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
  builtinImportProfiles,
  commitImportPlan,
  listProjectSnapshots,
  listProjectDocuments,
  listProjectSessions,
  listProjectWorkstreams,
  listProposedUpdates,
  listTrash as storageListTrash,
  linkProjectRepo,
  movePathToTrash,
  prepareImportPlan,
  prepareProjectCreation,
  purgeTrashItem as storagePurgeTrashItem,
  readJson,
  proposeMemoryUpdate as storageProposeMemoryUpdate,
  readTrashJsonPayload,
  rebuildProjectIndex,
  removeTrashMetadata,
  resolveRepoLinkPath,
  restorePathFromTrash,
  saveCheckpoint,
  saveContextBundle,
  startSession,
  createWorkstream as storageCreateWorkstream,
  getWorkstreamDetail as storageGetWorkstreamDetail,
  unlinkProjectRepo,
  writeDocument as storageWriteDocument,
  updateWorkstreamStatus as storageUpdateWorkstreamStatus,
  updateProposalStatus as storageUpdateProposalStatus,
  validateProjectWorkspace,
  writeProjectFile,
  writeJsonToTrash
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
    workingDirectory?: string;
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
    const workstreams = await listProjectWorkstreams(project);
    const inbox = await listProposedUpdates(project);
    const warnings = await validateProjectWorkspace(project);

    return {
      project,
      latestSession: sessions[0],
      activeSession: sessions.find((session) => session.status === "active"),
      counts: {
        sessions: sessions.length,
        documents: docs.length,
        workstreams: workstreams.length,
        diagrams: docs.filter((doc) => doc.type === "diagram").length,
        pendingInbox: inbox.filter((item) => item.status === "pending").length,
        warnings: warnings.length
      },
      warnings
    };
  }

  async updateMemoryWritePolicy(params: {
    projectId: string;
    allowAgentDirectWrites?: boolean;
    reviewMode?: MemoryReviewMode;
  }) {
    const project = await this.getProject(params.projectId);
    const current = {
      ...DEFAULT_MEMORY_WRITE_POLICY,
      ...(project.memoryWritePolicy || {})
    };
    const reviewMode = normalizeMemoryReviewMode(params.reviewMode, current.reviewMode);
    const nextPolicy = {
      ...current,
      allowAgentDirectWrites: reviewMode === "all"
        ? false
        : params.allowAgentDirectWrites ?? current.allowAgentDirectWrites,
      reviewMode
    };
    const nextProject = {
      ...project,
      memoryWritePolicy: nextPolicy,
      updated: nowIso()
    };
    await writeProjectFile(nextProject);
    await this.registry.register(nextProject);
    return nextPolicy;
  }

  async updateGraphRules(params: {
    projectId: string;
    graphRules?: unknown[];
  }) {
    const project = await this.getProject(params.projectId);
    const graphRules = normalizeGraphExtractionRules(params.graphRules);
    const nextProject = {
      ...project,
      graphRules,
      updated: nowIso()
    };
    await writeProjectFile(nextProject);
    await this.registry.register(nextProject);
    return graphRules;
  }

  async ensureProject(params: { projectId: string }): Promise<Project> {
    const project = await this.getProject(params.projectId);
    await ensureProjectWorkspace(project);
    return project;
  }

  async listProjectRepos(params: { projectId: string }) {
    const project = await this.getProject(params.projectId);
    return project.repos;
  }

  async linkRepo(params: {
    projectId: string;
    repoPath: string;
    role?: RepoLink["role"];
    name?: string;
    description?: string;
    defaultBranch?: string;
    writePointerFile?: boolean;
  }) {
    const project = await this.getProject(params.projectId);
    const repoRoot = await resolveRepoLinkPath(params.repoPath);
    const linkedProject = await this.registry.findByRepo(repoRoot);
    if (linkedProject && linkedProject.id !== project.id) {
      throw new Error(`Repo is already linked to project ${linkedProject.id}: ${repoRoot}`);
    }

    const result = await linkProjectRepo({
      project,
      repoPath: repoRoot,
      role: normalizeRepoRole(params.role),
      name: params.name,
      description: params.description,
      defaultBranch: params.defaultBranch,
      writePointerFile: params.writePointerFile
    });
    await this.registry.register(result.project);
    return result;
  }

  async listWorkstreams(params: { projectId: string }) {
    return listProjectWorkstreams(await this.getProject(params.projectId));
  }

  async createWorkstream(params: {
    projectId: string;
    name: string;
    summary?: string;
    goal?: string;
    topics?: string[];
    repoRoles?: string[];
    relatedTasks?: string[];
    relatedFiles?: string[];
    body?: string;
  }) {
    const project = await this.getProject(params.projectId);
    return storageCreateWorkstream({
      project,
      name: params.name,
      summary: params.summary,
      goal: params.goal,
      topics: params.topics,
      repoRoles: params.repoRoles,
      relatedTasks: params.relatedTasks,
      relatedFiles: params.relatedFiles,
      body: params.body
    });
  }

  async getWorkstreamDetail(params: { projectId: string; workstreamId: string }) {
    return storageGetWorkstreamDetail(await this.getProject(params.projectId), params.workstreamId);
  }

  async updateWorkstreamStatus(params: {
    projectId: string;
    workstreamId: string;
    status: Parameters<typeof storageUpdateWorkstreamStatus>[0]["status"];
  }) {
    return storageUpdateWorkstreamStatus({
      project: await this.getProject(params.projectId),
      workstreamId: params.workstreamId,
      status: params.status
    });
  }

  async unlinkRepo(params: {
    projectId: string;
    repoPath: string;
    removePointerFile?: boolean;
  }) {
    const project = await this.getProject(params.projectId);
    const result = await unlinkProjectRepo({
      project,
      repoPath: params.repoPath,
      removePointerFile: params.removePointerFile
    });
    await this.registry.register(result.project);
    return result;
  }

  async deleteProject(params: { projectId: string }) {
    const project = await this.getProject(params.projectId);
    const item = await movePathToTrash({
      memoryRoot: this.registry.memoryRoot,
      type: "project",
      itemId: project.id,
      title: project.name,
      projectId: project.id,
      projectName: project.name,
      originalPath: project.memoryRoot,
      critical: true,
      details: { repos: project.repos.length }
    });
    await this.registry.unregister(params.projectId);
    return item;
  }

  async deleteRepo(params: {
    projectId: string;
    repoPath: string;
    removePointerFile?: boolean;
  }) {
    const project = await this.getProject(params.projectId);
    const result = await unlinkProjectRepo({
      project,
      repoPath: params.repoPath,
      removePointerFile: params.removePointerFile
    });
    await this.registry.register(result.project);
    return writeJsonToTrash({
      memoryRoot: this.registry.memoryRoot,
      type: "repo",
      projectId: project.id,
      projectName: project.name,
      itemId: result.removedRepo.path,
      title: result.removedRepo.name || path.basename(result.removedRepo.path),
      payload: result.removedRepo,
      critical: false,
      details: {
        repoPath: result.removedRepo.path,
        pointerRemoved: result.pointerRemoved,
        pointerFilePath: result.pointerFilePath
      }
    });
  }

  async deleteWorkstream(params: { projectId: string; workstreamId: string }) {
    const project = await this.getProject(params.projectId);
    const detail = await storageGetWorkstreamDetail(project, params.workstreamId);
    if (!detail.workstream.filePath) throw new Error(`Workstream has no file path: ${params.workstreamId}`);
    return movePathToTrash({
      memoryRoot: this.registry.memoryRoot,
      type: "workstream",
      projectId: project.id,
      projectName: project.name,
      itemId: detail.workstream.id,
      title: detail.workstream.name,
      originalPath: detail.workstream.filePath,
      critical: false
    });
  }

  async deleteSession(params: { projectId: string; sessionId: string }) {
    const project = await this.getProject(params.projectId);
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

  async deleteDocument(params: { projectId: string; documentId: string }) {
    const project = await this.getProject(params.projectId);
    const docs = await listProjectDocuments(project);
    const doc = docs.find((candidate) => candidate.id === params.documentId);
    if (!doc) throw new Error(`Document not found: ${params.documentId}`);
    return movePathToTrash({
      memoryRoot: this.registry.memoryRoot,
      type: "document",
      projectId: project.id,
      projectName: project.name,
      itemId: doc.id,
      title: doc.title,
      originalPath: doc.filePath,
      critical: ["overview", "privacy", "commands", "glossary"].includes(doc.type),
      details: { type: doc.type, status: doc.status, visibility: doc.visibility }
    });
  }

  async deleteInboxItem(params: { projectId: string; proposalId: string }) {
    const project = await this.getProject(params.projectId);
    const proposals = await listProposedUpdates(project);
    const proposal = proposals.find((candidate) => candidate.id === params.proposalId);
    if (!proposal) throw new Error(`Inbox proposal not found: ${params.proposalId}`);
    return movePathToTrash({
      memoryRoot: this.registry.memoryRoot,
      type: "inbox-proposal",
      projectId: project.id,
      projectName: project.name,
      itemId: proposal.id,
      title: proposal.reason || proposal.type,
      originalPath: path.join(project.memoryRoot, "inbox", "proposed-updates", `${proposal.id}.json`),
      critical: false,
      details: { type: proposal.type, status: proposal.status, confidence: proposal.confidence }
    });
  }

  async listBackups(params: { projectId: string }) {
    return listProjectSnapshots(await this.getProject(params.projectId));
  }

  async deleteBackup(params: { projectId: string; snapshotPath: string }) {
    const project = await this.getProject(params.projectId);
    const backups = await listProjectSnapshots(project);
    const backup = backups.find((candidate) => candidate.snapshotPath === params.snapshotPath);
    if (!backup) throw new Error(`Backup snapshot not found: ${params.snapshotPath}`);
    return movePathToTrash({
      memoryRoot: this.registry.memoryRoot,
      type: "backup",
      projectId: project.id,
      projectName: project.name,
      itemId: backup.created,
      title: `Snapshot ${backup.created}`,
      originalPath: backup.snapshotPath,
      critical: false
    });
  }

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
    const project = await this.getProject(params.projectId);
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
    const project = await this.getProject(params.projectId);
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
    status?: Parameters<typeof storageCreateDocument>[0]["status"];
    visibility?: Parameters<typeof storageCreateDocument>[0]["visibility"];
    topics?: string[];
    relatedFiles?: string[];
  }) {
    const project = await this.getProject(params.projectId);
    const policy = {
      ...DEFAULT_MEMORY_WRITE_POLICY,
      ...(project.memoryWritePolicy || {})
    };
    if (!policy.allowAgentDirectWrites) {
      throw new Error("Direct memory writes are disabled for this project. Use memory.propose_memory_update or turn review mode off in Settings.");
    }
    return storageCreateDocument({ project, ...params });
  }

  async updateDocument(params: {
    projectId: string;
    documentId: string;
    title?: string;
    body?: string;
  }) {
    const project = await this.getProject(params.projectId);
    const docs = await listProjectDocuments(project);
    const doc = docs.find((candidate) => candidate.id === params.documentId);
    if (!doc) throw new Error(`Document not found: ${params.documentId}`);

    const updated = {
      ...doc,
      title: params.title?.trim() || doc.title,
      body: typeof params.body === "string" ? params.body : doc.body,
      updated: nowIso()
    };

    await storageWriteDocument(updated);
    return updated;
  }

  listImportProfiles() {
    return builtinImportProfiles();
  }

  async prepareImport(params: {
    projectId: string;
    sourceRoot: string;
    profile?: string | ImportProfile;
    limit?: number;
  }) {
    const project = await this.getProject(params.projectId);
    return prepareImportPlan({
      project,
      sourceRoot: params.sourceRoot,
      profile: params.profile,
      limit: params.limit
    });
  }

  async commitImport(params: {
    projectId: string;
    plan?: ImportPlan;
    sourceRoot?: string;
    profile?: string | ImportProfile;
    conflictStrategy?: ImportConflictStrategy;
    limit?: number;
  }) {
    const project = await this.getProject(params.projectId);
    return commitImportPlan({
      project,
      plan: params.plan,
      sourceRoot: params.sourceRoot,
      profile: params.profile,
      conflictStrategy: params.conflictStrategy,
      limit: params.limit
    });
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
      workstreams: await listProjectWorkstreams(project),
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

  async proposeGraphUpdate(params: {
    projectId: string;
    sourceSession?: string;
    sourceAgent?: string;
    confidence?: Parameters<typeof storageProposeMemoryUpdate>[0]["confidence"];
    affectedFiles?: string[];
    proposedPatch: string;
    reason: string;
  }) {
    return this.proposeMemoryUpdate({
      projectId: params.projectId,
      type: "graph-update",
      sourceSession: params.sourceSession,
      sourceAgent: params.sourceAgent,
      sourceKind: "external-ai",
      confidence: params.confidence,
      affectedFiles: params.affectedFiles,
      proposedPatch: params.proposedPatch,
      reason: params.reason
    });
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
      workstreams: await listProjectWorkstreams(project),
      sessions: await listProjectSessions(project),
      documents: await listProjectDocuments(project)
    });
  }

  async backupProject(params: { projectId: string }) {
    return createProjectSnapshot(await this.getProject(params.projectId));
  }

  async listTrash() {
    return storageListTrash(this.registry.memoryRoot);
  }

  async restoreTrashItem(params: { trashItemId: string }) {
    const item = (await storageListTrash(this.registry.memoryRoot)).find((candidate) => candidate.id === params.trashItemId);
    if (!item) throw new Error(`Trash item not found: ${params.trashItemId}`);

    if (item.type === "project") {
      await restorePathFromTrash(item);
      const project = await readJson<Project | undefined>(path.join(item.originalPath || "", "project.json"), undefined);
      if (!project) throw new Error(`Restored project is missing project.json: ${item.title}`);
      await this.registry.register(project);
      await removeTrashMetadata(this.registry.memoryRoot, item.id);
      return item;
    }

    if (item.type === "repo") {
      if (!item.projectId) throw new Error(`Trash repo item is missing projectId: ${item.id}`);
      const project = await this.getProject(item.projectId);
      const repo = await readTrashJsonPayload<RepoLink>(item);
      const result = await linkProjectRepo({
        project,
        repoPath: repo.path,
        role: repo.role,
        name: repo.name,
        description: repo.description,
        defaultBranch: repo.defaultBranch,
        writePointerFile: true
      });
      await this.registry.register(result.project);
      await removeTrashMetadata(this.registry.memoryRoot, item.id);
      return item;
    }

    await restorePathFromTrash(item);
    await removeTrashMetadata(this.registry.memoryRoot, item.id);
    return item;
  }

  async purgeTrashItem(params: { trashItemId: string }) {
    return storagePurgeTrashItem(this.registry.memoryRoot, params.trashItemId);
  }

  async emptyTrash(params: { trashItemIds?: string[] }) {
    const items = params.trashItemIds?.length
      ? params.trashItemIds
      : (await storageListTrash(this.registry.memoryRoot)).map((item) => item.id);
    const purged = [];
    for (const trashItemId of items) {
      purged.push(await storagePurgeTrashItem(this.registry.memoryRoot, trashItemId));
    }
    return { purged: purged.length, items: purged };
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

function normalizeRepoRole(input?: string): RepoLink["role"] {
  const role = String(input || "other").trim().toLowerCase();
  return role || "other";
}

function normalizeMemoryReviewMode(input: unknown, fallback: MemoryReviewMode): MemoryReviewMode {
  return input === "off" || input === "risky-only" || input === "all" ? input : fallback;
}

function normalizeGraphExtractionRules(input: unknown): GraphExtractionRule[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((rule) => normalizeGraphExtractionRule(rule))
    .filter(isDefined);
}

function normalizeGraphExtractionRule(input: unknown): GraphExtractionRule | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const match = stringValue(record.match);
  const nodeType = normalizeGraphRuleNodeType(stringValue(record.nodeType) || stringValue(record.node_type));
  if (!match || !nodeType) return undefined;

  const normalized: GraphExtractionRule = { match, nodeType };
  const label = stringValue(record.label);
  const topic = stringValue(record.topic);
  const edgeType = normalizeGraphRuleEdgeType(stringValue(record.edgeType) || stringValue(record.edge_type));
  const segment = numberValue(record.segment);
  const slugFromSegment = numberValue(record.slugFromSegment ?? record.slug_from_segment);
  const labelFromSegment = numberValue(record.labelFromSegment ?? record.label_from_segment);
  if (label) normalized.label = label;
  if (topic) normalized.topic = topic;
  if (edgeType) normalized.edgeType = edgeType;
  if (segment !== undefined) normalized.segment = segment;
  if (slugFromSegment !== undefined) normalized.slugFromSegment = slugFromSegment;
  if (labelFromSegment !== undefined) normalized.labelFromSegment = labelFromSegment;
  return normalized;
}

function normalizeGraphRuleNodeType(input: string | undefined): GraphRuleNodeType | undefined {
  const value = input?.trim().toLowerCase().replace(/_/g, "-");
  return GRAPH_RULE_NODE_TYPES.has(value as GraphRuleNodeType) ? value as GraphRuleNodeType : undefined;
}

function normalizeGraphRuleEdgeType(input: string | undefined): GraphRuleEdgeType | undefined {
  const value = input?.trim().toLowerCase().replace(/_/g, "-");
  return GRAPH_RULE_EDGE_TYPES.has(value as GraphRuleEdgeType) ? value as GraphRuleEdgeType : undefined;
}

function stringValue(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function numberValue(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) return Math.trunc(input);
  if (typeof input === "string" && input.trim() && Number.isFinite(Number(input))) return Math.trunc(Number(input));
  return undefined;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

const GRAPH_RULE_NODE_TYPES = new Set<GraphRuleNodeType>([
  "topic",
  "service",
  "package",
  "diagram-group",
  "code-area",
  "external-reference"
]);

const GRAPH_RULE_EDGE_TYPES = new Set<GraphRuleEdgeType>([
  "supports",
  "explains",
  "mentions",
  "uses",
  "contains",
  "depends-on",
  "related"
]);
