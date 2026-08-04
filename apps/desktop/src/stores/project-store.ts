import { makeAutoObservable, runInAction } from "mobx";
import type { ZharwingMemoryClient } from "@zharwing/memory-api-client";
import type {
  MemoryWritePolicy,
  Project,
  ProjectCreationPreview,
  RepoLink,
  Session
} from "@zharwing/memory-core";
import type { RootStore } from "./root-store.js";

/** Result shape of `memory.get_project_summary`. */
export interface ProjectSummarySnapshot {
  project: Project;
  latestSession?: Session;
  activeSession?: Session;
  counts: {
    sessions: number;
    documents: number;
    workstreams: number;
    diagrams: number;
    pendingInbox: number;
    warnings: number;
  };
  warnings: string[];
}

export class ProjectStore {
  list: Project[] = [];
  selectedProjectId = "";
  projectCreationPreview: ProjectCreationPreview | undefined = undefined;
  summary: ProjectSummarySnapshot | undefined = undefined;
  repoLinks: RepoLink[] = [];
  loading = false;
  error = "";

  constructor(
    readonly client: ZharwingMemoryClient,
    readonly root: RootStore
  ) {
    makeAutoObservable(this, {
      client: false,
      root: false
    });
  }

  get selectedProject() {
    return this.list.find((project) => project.id === this.selectedProjectId);
  }

  get selectedMemoryWritePolicy() {
    const policy: Partial<MemoryWritePolicy> = this.summary?.project?.memoryWritePolicy || this.selectedProject?.memoryWritePolicy || {};
    return {
      allowAgentDirectWrites: policy.allowAgentDirectWrites ?? true,
      reviewMode: policy.reviewMode || "off"
    };
  }

  async load(preferredProjectId?: string) {
    await this.run(async () => {
      const projects = await this.client.call<Project[]>("memory.list_projects");
      runInAction(() => {
        this.list = projects;
        const preferred = preferredProjectId
          ? projects.find((project) => project.id === preferredProjectId)
          : undefined;
        const selectedStillExists = projects.some((project) => project.id === this.selectedProjectId);
        if (preferred) this.selectedProjectId = preferred.id;
        else if ((!this.selectedProjectId || !selectedStillExists) && projects[0]) this.selectedProjectId = projects[0].id;
      });
    });
  }

  async loadSummary() {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const summary = await this.client.call<ProjectSummarySnapshot>("memory.get_project_summary", {
        projectId: this.selectedProjectId
      });
      runInAction(() => {
        this.summary = summary;
        this.repoLinks = summary?.project?.repos || [];
      });
    });
  }

  async selectProject(projectId: string) {
    this.selectedProjectId = projectId;
    this.root.semantic.resetForProjectSwitch();
    this.root.assistant.resetProviderCheck();
    await this.root.refreshAll();
  }

  async prepareProjectCreation(args: {
    workingDirectory?: string;
    projectName?: string;
    createPointerFile: boolean;
    bootstrapFiles?: string[];
  }) {
    await this.run(async () => {
      const preview = await this.client.call<ProjectCreationPreview>("memory.prepare_project_creation", {
        workingDirectory: args.workingDirectory?.trim() || undefined,
        projectName: args.projectName?.trim() || undefined,
        createPointerFile: args.createPointerFile,
        bootstrapFiles: args.bootstrapFiles || []
      });
      runInAction(() => {
        this.projectCreationPreview = preview;
      });
    });
  }

  async createProjectFromPreview() {
    if (!this.projectCreationPreview) return false;
    let createdProjectId = "";
    await this.run(async () => {
      const project = await this.client.call<Project>("memory.create_project", {
        preview: this.projectCreationPreview
      });
      createdProjectId = project.id;
      await this.load();
      runInAction(() => {
        this.selectedProjectId = createdProjectId;
        this.projectCreationPreview = undefined;
      });
      await this.root.refreshAll();
    });
    return Boolean(createdProjectId && this.selectedProjectId === createdProjectId && !this.error);
  }

  async deleteProject(projectId: string) {
    await this.run(async () => {
      await this.client.call("memory.delete_project", { projectId });
      await this.load();
      runInAction(() => {
        if (this.selectedProjectId === projectId) {
          this.selectedProjectId = this.list[0]?.id || "";
          this.summary = undefined;
          this.repoLinks = [];
          this.root.sessions.clear();
          this.root.docs.clear();
          this.root.workstreams.clear();
          this.root.semantic.clear();
          this.root.assistant.clear();
        }
      });
      if (this.selectedProjectId) await this.root.refreshAll();
      await this.root.system.loadTrash();
    });
  }

  async updateMemoryWritePolicy(args: {
    allowAgentDirectWrites?: boolean;
    reviewMode?: string;
  }) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.update_memory_write_policy", {
        projectId: this.selectedProjectId,
        ...args
      });
      await this.load();
      await this.loadSummary();
    });
  }

  async loadRepoLinks() {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const repos = await this.client.call<RepoLink[]>("memory.list_project_repos", {
        projectId: this.selectedProjectId
      });
      runInAction(() => {
        this.repoLinks = repos;
      });
    });
  }

  async linkRepo(args: {
    repoPath: string;
    role: string;
    name?: string;
    description?: string;
    defaultBranch?: string;
    writePointerFile: boolean;
  }) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.link_repo", {
        projectId: this.selectedProjectId,
        repoPath: args.repoPath,
        role: args.role,
        name: args.name || undefined,
        description: args.description || undefined,
        defaultBranch: args.defaultBranch || undefined,
        writePointerFile: args.writePointerFile
      });
      await this.load();
      await this.loadSummary();
      await this.loadRepoLinks();
      await this.root.graph.load();
    });
  }

  async unlinkRepo(repoPath: string, removePointerFile: boolean) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.unlink_repo", {
        projectId: this.selectedProjectId,
        repoPath,
        removePointerFile
      });
      await this.load();
      await this.loadSummary();
      await this.loadRepoLinks();
      await this.root.graph.load();
    });
  }

  async deleteRepo(repoPath: string, removePointerFile = true) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.delete_repo", {
        projectId: this.selectedProjectId,
        repoPath,
        removePointerFile
      });
      await this.load();
      await this.loadSummary();
      await this.loadRepoLinks();
      await this.root.graph.load();
      await this.root.system.loadTrash();
    });
  }

  private async run(work: () => Promise<void>) {
    this.loading = true;
    this.error = "";
    try {
      await work();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
