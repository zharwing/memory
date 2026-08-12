import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_ASSISTANT_POLICY,
  DEFAULT_MEMORY_WRITE_POLICY,
  localDayKey,
  nowIso,
  type AssistantPolicy,
  type AssistantRuntimeType,
  type MemoryReviewMode,
  type Project,
  type ProjectCreationPreview,
  type RepoLink,
  type SessionSummary,
  type StartupProjectSummary,
  type StartupState,
  type StartupStateSnapshot,
  type StartupWorkstreamSummary
} from "@zharwing/memory-core";
import {
  ProjectRegistry,
  createProjectFromPreview,
  detectProject,
  ensureProjectWorkspace,
  linkProjectRepo,
  listProjectDocuments,
  listProjectSessionSummaries,
  listProjectSessions,
  listProjectWorkstreams,
  listProposedUpdates,
  movePathToTrash,
  prepareProjectCreation,
  rebuildProjectIndex,
  resolveRepoLinkPath,
  unlinkProjectRepo,
  validateProjectWorkspace,
  writeJsonToTrash,
  writeProjectFile
} from "@zharwing/memory-store";
import { resolveProject } from "./project-resolver.js";
import { SessionAuthorityStore } from "./session-visibility.js";
import { normalizeGraphExtractionRules } from "./graph-rules.js";

export class ProjectService {
  constructor(
    private readonly registry: ProjectRegistry,
    private readonly sessionAuthority: SessionAuthorityStore
  ) {}

  async listProjects(): Promise<Project[]> {
    return this.registry.listProjects();
  }

  async getProject(projectId: string): Promise<Project> {
    return resolveProject(this.registry, projectId);
  }

  async detectProject(params: { workingDirectory: string }) {
    const workingDirectory = await resolveSelectedDirectory(params.workingDirectory);
    return detectProject({ workingDirectory, registry: this.registry });
  }

  async getStartupState(params: {
    workingDirectory?: string;
    projectId?: string;
    clientName?: string;
    knownRevision?: string;
  }): Promise<StartupState> {
    const workingDirectory = params.workingDirectory
      ? await resolveSelectedDirectory(params.workingDirectory)
      : process.cwd();
    const detected = params.projectId
      ? undefined
      : await detectProject({ workingDirectory, registry: this.registry });
    const projectId = params.projectId || detected?.projectId;

    if (!projectId) {
      const snapshot: Omit<StartupStateSnapshot, "revision"> = {
        schema: "zharwing.memory.startup.v2",
        projectStatus: "unregistered",
        workingDirectory: boundedString(workingDirectory, 500),
        repoRoot: detected?.repoRoot ? boundedString(detected.repoRoot, 500) : undefined,
        detectedBranch: detected?.detectedBranch ? boundedString(detected.detectedBranch, 240) : undefined,
        recentSessions: [],
        workstreams: [],
        counts: {
          sessionsTotal: 0,
          recentSessionsReturned: 0,
          workstreamsTotal: 0,
          workstreamsReturned: 0
        },
        recommendedAction: "offer-create-project",
        contextReadiness: "needs-project",
        safetyStatus: "clean",
        messageForClient: "This repo is not registered in Zharwing Memory. Offer to create or link a project."
      };
      return withStartupRevision(snapshot, params.knownRevision);
    }

    const project = await this.getProject(projectId);
    const allSessionSummaries = await this.sessionAuthority.applyVisibilities(
      project,
      await listProjectSessionSummaries(project)
    );
    const sessions = allSessionSummaries.map(compactStartupSession);
    const activeSession = sessions.find((session) => session.status === "active");
    const latestSession = sessions[0]?.id === activeSession?.id ? undefined : sessions[0];
    const recentSessions = sessions
      .filter((session) => session.id !== activeSession?.id && session.id !== latestSession?.id)
      .slice(0, 3);
    // Open lanes only: closed/archived workstreams are not attachment targets.
    const allOpenWorkstreams = (await listProjectWorkstreams(project)).filter(
      (workstream) => workstream.status === "active" || workstream.status === "paused"
    );
    const workstreams = allOpenWorkstreams.slice(0, 12).map(compactWorkstream);
    // Agents routinely exit without closing, so a session still marked active
    // on an earlier local day is abandoned rather than resumable.
    // `memory.start_session` closes it at day rollover; until then startup must
    // not send the agent back into yesterday's log.
    const activeSessionDay = activeSession
      ? localDayKey(activeSession.updated || activeSession.started)
      : "";
    const activeSessionIsStale = Boolean(activeSessionDay) && activeSessionDay < localDayKey();
    const recommendedAction = activeSession && !activeSessionIsStale
      ? "resume-active"
      : latestSession && project.contextPolicy.startupMode !== "always-start-new-session"
        ? "resume-latest"
        : "start-new";

    const snapshot: Omit<StartupStateSnapshot, "revision"> = {
      schema: "zharwing.memory.startup.v2",
      projectStatus: "resolved",
      workingDirectory: boundedString(workingDirectory, 500),
      repoRoot: boundedOptionalString(detected?.repoRoot || project.repos[0]?.path, 500),
      detectedBranch: boundedOptionalString(detected?.detectedBranch, 240),
      project: compactProject(project),
      activeSession,
      latestSession,
      recentSessions,
      workstreams,
      counts: {
        sessionsTotal: allSessionSummaries.length,
        recentSessionsReturned: recentSessions.length,
        workstreamsTotal: allOpenWorkstreams.length,
        workstreamsReturned: workstreams.length
      },
      recommendedAction,
      contextReadiness: activeSession || latestSession ? "ready" : "needs-session",
      safetyStatus: "clean",
      messageForClient: activeSessionIsStale
        ? `Resolved Zharwing Memory project ${boundedString(project.name, 160)}. The open session is from an earlier day and will be closed automatically; start a new session for today's work.`
        : `Resolved Zharwing Memory project ${boundedString(project.name, 160)}.`
    };
    return withStartupRevision(snapshot, params.knownRevision);
  }

  async prepareProjectCreation(params: {
    workingDirectory?: string;
    projectName?: string;
    createPointerFile?: boolean;
    bootstrapFiles?: string[];
  }): Promise<ProjectCreationPreview> {
    const workingDirectory = params.workingDirectory
      ? await resolveSelectedDirectory(params.workingDirectory)
      : undefined;
    return prepareProjectCreation({
      workingDirectory,
      projectName: params.projectName,
      createPointerFile: params.createPointerFile,
      bootstrapFiles: params.bootstrapFiles,
      registry: this.registry
    });
  }

  async createProject(params: { preview: ProjectCreationPreview }): Promise<Project> {
    if (params.preview.requiresUserConfirmation !== true) {
      throw new Error("Project creation requires an explicit preview confirmation.");
    }
    const authoritativePreview = await this.prepareProjectCreation({
      workingDirectory: params.preview.repoRoot,
      projectName: params.preview.proposedProjectName,
      createPointerFile: params.preview.willCreatePointerFile,
      bootstrapFiles: params.preview.willCreateBootstrapFiles
    });
    if (previewSecurityContract(params.preview) !== previewSecurityContract(authoritativePreview)) {
      throw new Error("Project creation preview is stale or does not match the canonical target.");
    }
    return createProjectFromPreview({
      preview: authoritativePreview,
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

  async updateAssistantPolicy(params: {
    projectId: string;
    enabled?: boolean;
    runtimeType?: AssistantRuntimeType;
    modelName?: string;
    modelDisplayName?: string;
    modelPath?: string;
    endpoint?: string;
    autoAcceptLowRiskMetadata?: boolean;
    policy?: Partial<AssistantPolicy>;
  }) {
    const project = await this.getProject(params.projectId);
    const patch = params.policy || params;
    const current = {
      ...DEFAULT_ASSISTANT_POLICY,
      ...(project.assistantPolicy || {})
    };
    const nextPolicy: AssistantPolicy = {
      ...current,
      enabled: Boolean(patch.enabled ?? current.enabled),
      runtimeType: normalizeAssistantRuntimeType(patch.runtimeType, current.runtimeType),
      modelName: normalizeOptionalString(patch.modelName ?? current.modelName),
      modelDisplayName: normalizeOptionalString(patch.modelDisplayName ?? current.modelDisplayName),
      modelPath: normalizeOptionalString(patch.modelPath ?? current.modelPath),
      endpoint: normalizeOptionalString(patch.endpoint ?? current.endpoint),
      autoAcceptLowRiskMetadata: Boolean(patch.autoAcceptLowRiskMetadata ?? current.autoAcceptLowRiskMetadata)
    };
    if (nextPolicy.runtimeType === "disabled") {
      nextPolicy.enabled = false;
    }

    const nextProject = {
      ...project,
      assistantPolicy: nextPolicy,
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

  async validateProject(params: { projectId: string }) {
    return validateProjectWorkspace(await this.getProject(params.projectId));
  }

  async rebuildIndex(params: { projectId: string }) {
    return rebuildProjectIndex(await this.getProject(params.projectId));
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
}

function previewSecurityContract(preview: ProjectCreationPreview): string {
  return JSON.stringify({
    proposedProjectName: preview.proposedProjectName,
    proposedProjectId: preview.proposedProjectId,
    repoRoot: preview.repoRoot,
    memoryLocation: preview.memoryLocation,
    willCreatePointerFile: preview.willCreatePointerFile,
    pointerFilePath: preview.pointerFilePath,
    willCreateBootstrapFiles: [...preview.willCreateBootstrapFiles].sort(),
    discoveryLevel: preview.discoveryLevel,
    requiresUserConfirmation: preview.requiresUserConfirmation
  });
}

async function resolveSelectedDirectory(input: string): Promise<string> {
  if (!input || input.length > 32_768 || input.includes("\0")) {
    throw new Error("Selected directory is invalid.");
  }
  const absolute = path.resolve(input);
  const canonical = await fs.realpath(absolute);
  const stat = await fs.stat(canonical);
  if (!stat.isDirectory()) throw new Error("Selected path is not a directory.");
  await assertNoLinkComponents(absolute);
  return canonical;
}

async function assertNoLinkComponents(absolutePath: string): Promise<void> {
  const parsed = path.parse(absolutePath);
  const relative = absolutePath.slice(parsed.root.length);
  let current = parsed.root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const entry = await fs.lstat(current);
    if (entry.isSymbolicLink()) {
      throw new Error("Selected directory cannot traverse a symbolic link or junction.");
    }
  }
}

function normalizeRepoRole(input?: string): RepoLink["role"] {
  const role = String(input || "other").trim().toLowerCase();
  return role || "other";
}

function normalizeMemoryReviewMode(input: unknown, fallback: MemoryReviewMode): MemoryReviewMode {
  return input === "off" || input === "risky-only" || input === "all" ? input : fallback;
}

function normalizeAssistantRuntimeType(input: unknown, fallback: AssistantRuntimeType): AssistantRuntimeType {
  return input === "app-managed-llamacpp" ||
    input === "llama-cpp" ||
    input === "ollama" ||
    input === "lm-studio" ||
    input === "openai" ||
    input === "anthropic" ||
    input === "custom-openai-compatible" ||
    input === "disabled"
    ? input
    : fallback;
}

function normalizeOptionalString(input: unknown): string | undefined {
  const value = String(input || "").trim();
  return value || undefined;
}

function compactProject(project: Project): StartupProjectSummary {
  return {
    id: project.id,
    name: boundedString(project.name, 160),
    updated: project.updated,
    repoCount: project.repos.length,
    repos: project.repos.slice(0, 5).map((repo) => ({
      path: boundedString(repo.path, 500),
      name: repo.name ? boundedString(repo.name, 160) : undefined,
      role: boundedString(repo.role, 80)
    }))
  };
}

function compactWorkstream(workstream: Awaited<ReturnType<typeof listProjectWorkstreams>>[number]): StartupWorkstreamSummary {
  return {
    id: workstream.id,
    name: boundedString(workstream.name, 160),
    slug: boundedString(workstream.slug, 160),
    status: workstream.status,
    summary: workstream.summary ? boundedString(workstream.summary, 500) : undefined,
    goal: workstream.goal ? boundedString(workstream.goal, 500) : undefined,
    topics: workstream.topics.slice(0, 5).map((topic) => boundedString(topic, 80)),
    updated: workstream.updated
  };
}

function compactStartupSession(session: SessionSummary): SessionSummary {
  return {
    ...session,
    taskTitle: boundedString(session.taskTitle, 160),
    goal: boundedOptionalString(session.goal, 300),
    branch: boundedOptionalString(session.branch, 120),
    agent: boundedOptionalString(session.agent, 120),
    client: boundedOptionalString(session.client, 120),
    summary: boundedOptionalString(session.summary, 600),
    topics: session.topics.slice(0, 5).map((topic) => boundedString(topic, 50)),
    nextSteps: session.nextSteps.slice(0, 5).map((step) => boundedString(step, 120)),
    blockers: session.blockers.slice(0, 5).map((blocker) => boundedString(blocker, 120)),
    touchedFiles: session.touchedFiles.slice(0, 10).map((file) => boundedString(file, 160)),
    workstreamIds: session.workstreamIds.slice(0, 5).map((id) => boundedString(id, 100))
  };
}

function withStartupRevision(
  snapshot: Omit<StartupStateSnapshot, "revision">,
  knownRevision?: string
): StartupState {
  const fitted: Omit<StartupStateSnapshot, "revision"> = {
    ...snapshot,
    recentSessions: [...snapshot.recentSessions],
    workstreams: [...snapshot.workstreams],
    project: snapshot.project
      ? { ...snapshot.project, repos: [...snapshot.project.repos] }
      : undefined,
    counts: { ...snapshot.counts }
  };
  while (Buffer.byteLength(JSON.stringify(fitted), "utf8") > 15 * 1024 && fitted.recentSessions.length > 0) {
    fitted.recentSessions.pop();
    fitted.counts.recentSessionsReturned = fitted.recentSessions.length;
  }
  while (Buffer.byteLength(JSON.stringify(fitted), "utf8") > 15 * 1024 && fitted.workstreams.length > 0) {
    fitted.workstreams.pop();
    fitted.counts.workstreamsReturned = fitted.workstreams.length;
  }
  while (Buffer.byteLength(JSON.stringify(fitted), "utf8") > 15 * 1024 && fitted.project?.repos.length) {
    fitted.project.repos.pop();
  }
  if (
    Buffer.byteLength(JSON.stringify(fitted), "utf8") > 15 * 1024 &&
    fitted.activeSession &&
    fitted.latestSession
  ) {
    fitted.latestSession = undefined;
  }
  const revision = createHash("sha256")
    .update(JSON.stringify(fitted))
    .digest("hex")
    .slice(0, 24);
  if (knownRevision === revision) {
    return {
      schema: "zharwing.memory.startup.v2",
      notModified: true,
      projectId: fitted.project?.id,
      sessionId: fitted.activeSession?.id || fitted.latestSession?.id,
      revision
    };
  }
  return { ...fitted, revision };
}

function boundedString(input: string, maxChars: number): string {
  return input.length <= maxChars ? input : `${input.slice(0, Math.max(0, maxChars - 1))}…`;
}

function boundedOptionalString(input: string | undefined, maxChars: number): string | undefined {
  return input ? boundedString(input, maxChars) : undefined;
}
