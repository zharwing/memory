import path from "node:path";
import {
  DEFAULT_MEMORY_WRITE_POLICY,
  nowIso,
  type MemoryReviewMode,
  type Project,
  type ProjectCreationPreview,
  type RepoLink,
  type StartupState
} from "@aimem/core";
import {
  ProjectRegistry,
  createProjectFromPreview,
  detectProject,
  ensureProjectWorkspace,
  getActiveSession,
  linkProjectRepo,
  listProjectDocuments,
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
} from "@aimem/storage";
import { resolveProject } from "./project-resolver.js";
import { normalizeGraphExtractionRules } from "./graph-rules.js";

export class ProjectService {
  constructor(private readonly registry: ProjectRegistry) {}

  async listProjects(): Promise<Project[]> {
    return this.registry.listProjects();
  }

  async getProject(projectId: string): Promise<Project> {
    return resolveProject(this.registry, projectId);
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

function normalizeRepoRole(input?: string): RepoLink["role"] {
  const role = String(input || "other").trim().toLowerCase();
  return role || "other";
}

function normalizeMemoryReviewMode(input: unknown, fallback: MemoryReviewMode): MemoryReviewMode {
  return input === "off" || input === "risky-only" || input === "all" ? input : fallback;
}
