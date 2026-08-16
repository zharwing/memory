import { makeAutoObservable } from "mobx";
import type { ProjectsClientPort } from "../application/ports/features.js";
import { parseOperationInput, type OperationOutput } from "@zharwing/memory-core";
import type {
  MemoryWritePolicy,
  MemoryReviewMode,
  Project,
  ProjectCreationPreview,
  RepoLink
} from "@zharwing/memory-core";
import {
  ProjectScopeCoordinator,
  type ApplicationScopePort
} from "../application/project-scope/project-scope-coordinator.js";
import {
  OperationLedger,
  type OperationAttempt,
  type OperationState
} from "../application/operations/operation-state.js";
import { prepareDestructiveDispatch } from "../application/operations/destructive-operation.js";
import type {
  ProjectStoreCoordinator,
  ScopeToken,
  StoreAsyncRuntimePort
} from "../application/operations/store-ports.js";
import {
  ResourceSlot,
  publicErrorCopy,
  type ResourceState
} from "../application/resources/resource-state.js";
import { resourceReadModel } from "../application/resources/resource-read-model.js";

/** Result shape of `memory.get_project_summary`, owned by the core operation contract. */
export type ProjectSummarySnapshot = OperationOutput<"memory.get_project_summary">;

export interface SelectProjectOptions {
  /** Set false when the caller owns the subsequent coordinated refresh. */
  readonly refresh?: boolean;
}

export interface LoadProjectsOptions {
  /** Set false to update the global list without changing project scope. */
  readonly activate?: boolean;
}

export class ProjectStore {
  readonly projectsResource: ResourceSlot<Project[]>;
  readonly summaryResource: ResourceSlot<ProjectSummarySnapshot>;
  readonly repoLinksResource: ResourceSlot<RepoLink[]>;
  readonly projectCreationPreviewResource: ResourceSlot<ProjectCreationPreview | undefined>;
  readonly operations: OperationLedger;

  constructor(
    private readonly client: ProjectsClientPort,
    private readonly scope: ProjectScopeCoordinator,
    applicationScope: ApplicationScopePort,
    private readonly coordinator: ProjectStoreCoordinator,
    runtime: StoreAsyncRuntimePort
  ) {
    this.projectsResource = new ResourceSlot(applicationScope, runtime);
    this.projectCreationPreviewResource = new ResourceSlot(applicationScope, runtime);
    this.summaryResource = new ResourceSlot(scope, runtime, () => false);
    this.repoLinksResource = new ResourceSlot(scope, runtime);
    this.operations = new OperationLedger(runtime);
    makeAutoObservable<this, "client" | "scope" | "coordinator">(this, {
      client: false,
      scope: false,
      coordinator: false,
      projectsResource: false,
      summaryResource: false,
      repoLinksResource: false,
      projectCreationPreviewResource: false,
      operations: false
    });
  }

  get projectsState(): ResourceState<Project[]> { return this.projectsResource.state; }
  get summaryState(): ResourceState<ProjectSummarySnapshot> { return this.summaryResource.state; }
  get repoLinksState(): ResourceState<RepoLink[]> { return this.repoLinksResource.state; }
  get projectCreationPreviewState(): ResourceState<ProjectCreationPreview | undefined> {
    return this.projectCreationPreviewResource.state;
  }
  get projectsRead() { return resourceReadModel(this.projectsResource); }
  get summaryRead() { return resourceReadModel(this.summaryResource); }
  get repoLinksRead() { return resourceReadModel(this.repoLinksResource); }
  get projectCreationPreviewRead() { return resourceReadModel(this.projectCreationPreviewResource); }
  get list(): Project[] { return this.projectsResource.data ?? []; }
  get selectedProjectId(): string { return this.scope.currentProjectId(); }
  get projectCreationPreview(): ProjectCreationPreview | undefined {
    return this.projectCreationPreviewResource.data;
  }
  get summary(): ProjectSummarySnapshot | undefined { return this.summaryResource.data; }
  get repoLinks(): RepoLink[] { return this.repoLinksResource.data ?? []; }
  get selectedProject(): Project | undefined {
    return this.list.find((project) => project.id === this.selectedProjectId);
  }
  get selectedMemoryWritePolicy(): Required<MemoryWritePolicy> {
    const policy: Partial<MemoryWritePolicy> =
      this.summary?.project?.memoryWritePolicy ?? this.selectedProject?.memoryWritePolicy ?? {};
    return {
      allowAgentDirectWrites: policy.allowAgentDirectWrites ?? true,
      reviewMode: policy.reviewMode ?? "off"
    };
  }
  get loading(): boolean {
    return this.projectsResource.loading || this.summaryResource.loading ||
      this.repoLinksResource.loading || this.projectCreationPreviewResource.loading ||
      this.operations.isBusy();
  }
  get error(): string {
    return publicErrorCopy(
      this.projectsResource.error ?? this.summaryResource.error ?? this.repoLinksResource.error ??
      this.projectCreationPreviewResource.error ?? this.operations.error
    );
  }
  operationState(key: string): OperationState { return this.operations.state(key); }

  clearScoped(): void {
    this.summaryResource.reset();
    this.repoLinksResource.reset();
    this.projectCreationPreviewResource.reset();
    this.operations.resetScope(this.scope.captureScope());
  }

  async load(
    preferredProjectId?: string,
    options: LoadProjectsOptions = {}
  ): Promise<void> {
    const attempt = this.projectsResource.begin();
    if (!attempt) return;
    try {
      const projects = await this.client.operation(
        "memory.list_projects",
        {},
        { signal: attempt.scope.signal }
      );
      if (!this.projectsResource.succeed(attempt, projects)) return;
      if (options.activate === false) return;
      const preferred = preferredProjectId
        ? projects.find((project) => project.id === preferredProjectId)
        : undefined;
      const current = projects.find((project) => project.id === this.selectedProjectId);
      const selected = preferred ?? current ?? projects[0];
      if (selected) this.scope.activate(selected.id, selected.repos?.[0]?.path);
      else this.scope.clear();
    } catch (error) {
      this.projectsResource.fail(attempt, error);
    }
  }

  async loadSummary(token = this.scope.captureScope()): Promise<void> {
    const attempt = this.summaryResource.begin(token);
    if (!attempt) return;
    try {
      const summary = await this.client.operation(
        "memory.get_project_summary",
        { projectId: attempt.scope.projectId },
        { signal: attempt.scope.signal }
      );
      this.summaryResource.succeed(attempt, summary);
    } catch (error) {
      this.summaryResource.fail(attempt, error);
    }
  }

  selectProject(projectId: string, options: SelectProjectOptions = {}): boolean {
    const project = this.list.find((candidate) => candidate.id === projectId);
    if (!project) return false;
    const token = this.scope.activate(project.id, project.repos?.[0]?.path);
    if (!token) return false;
    if (options.refresh !== false) void this.coordinator.refreshAll();
    return this.scope.isScopeCurrent(token);
  }

  async prepareProjectCreation(args: {
    workingDirectory?: string;
    projectName?: string;
    createPointerFile: boolean;
    bootstrapFiles?: string[];
  }): Promise<void> {
    const attempt = this.projectCreationPreviewResource.begin();
    if (!attempt) return;
    try {
      const preview = await this.client.operation(
        "memory.prepare_project_creation",
        {
          workingDirectory: args.workingDirectory?.trim() || undefined,
          projectName: args.projectName?.trim() || undefined,
          createPointerFile: args.createPointerFile,
          bootstrapFiles: args.bootstrapFiles ?? []
        },
        { signal: attempt.scope.signal }
      );
      this.projectCreationPreviewResource.succeed(attempt, preview);
    } catch (error) {
      this.projectCreationPreviewResource.fail(attempt, error);
    }
  }

  async createProjectFromPreview(): Promise<boolean> {
    const preview = this.projectCreationPreview;
    if (!preview) return false;
    const project = await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.create_project",
      input: { preview },
      ledger: this.operations,
      key: "project:create"
    });
    if (!project) return false;
    await this.load(project.id);
    this.projectCreationPreviewResource.reset();
    if (this.selectedProjectId === project.id) await this.refreshSelectedProject();
    return this.selectedProjectId === project.id;
  }

  async deleteProject(projectId: string): Promise<void> {
    const selectedToken = this.selectedProjectId === projectId ? this.scope.captureScope() : undefined;
    const input = { projectId };
    const result = await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.delete_project",
      input,
      ledger: this.operations,
      key: `project:delete:${projectId}`,
      prepareDispatch: (operationId) => prepareDestructiveDispatch(
        this.client,
        projectId,
        "memory.delete_project",
        input,
        { idempotencyKey: operationId }
      )
    });
    if (!result) return;
    if (selectedToken && this.scope.isScopeCurrent(selectedToken)) this.scope.clear();
    await this.load(this.selectedProjectId || undefined);
  }

  async updateMemoryWritePolicy(args: {
    allowAgentDirectWrites?: boolean;
    reviewMode?: MemoryReviewMode | string;
  }): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const input = parseOperationInput("memory.update_memory_write_policy", {
      projectId: token.projectId,
      ...args
    });
    await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.update_memory_write_policy",
      input,
      ledger: this.operations,
      key: "project:policy",
      scope: token
    });
  }

  async loadRepoLinks(token = this.scope.captureScope()): Promise<void> {
    const attempt = this.repoLinksResource.begin(token);
    if (!attempt) return;
    try {
      const repos = await this.client.operation(
        "memory.list_project_repos",
        { projectId: attempt.scope.projectId },
        { signal: attempt.scope.signal }
      );
      this.repoLinksResource.succeed(attempt, repos);
    } catch (error) {
      this.repoLinksResource.fail(attempt, error);
    }
  }

  async linkRepo(args: {
    repoPath: string;
    role: string;
    name?: string;
    description?: string;
    defaultBranch?: string;
    writePointerFile: boolean;
  }): Promise<void> {
    await this.repoMutation("repo:link", "memory.link_repo", args);
  }

  async unlinkRepo(repoPath: string, removePointerFile: boolean): Promise<void> {
    await this.repoMutation("repo:unlink", "memory.unlink_repo", { repoPath, removePointerFile });
  }

  async deleteRepo(repoPath: string, removePointerFile = true): Promise<void> {
    await this.repoMutation("repo:delete", "memory.delete_repo", { repoPath, removePointerFile });
  }

  private async repoMutation(
    key: string,
    operation: "memory.link_repo" | "memory.unlink_repo" | "memory.delete_repo",
    args: Record<string, unknown>
  ): Promise<boolean> {
    const token = this.scope.captureScope();
    if (!token) return false;
    const common = {
      projectId: token.projectId,
      repoPath: String(args.repoPath)
    };
    const result = operation === "memory.link_repo"
      ? await this.coordinator.executeCommand({
          port: this.client,
          operation,
          input: {
            ...common,
            role: typeof args.role === "string" ? args.role : undefined,
            name: typeof args.name === "string" ? args.name : undefined,
            description: typeof args.description === "string" ? args.description : undefined,
            defaultBranch: typeof args.defaultBranch === "string" ? args.defaultBranch : undefined,
            writePointerFile: typeof args.writePointerFile === "boolean" ? args.writePointerFile : undefined
          },
          ledger: this.operations,
          key,
          scope: token
        })
      : operation === "memory.unlink_repo"
        ? await this.coordinator.executeCommand({
            port: this.client,
            operation,
            input: {
              ...common,
              removePointerFile: typeof args.removePointerFile === "boolean" ? args.removePointerFile : undefined
            },
            ledger: this.operations,
            key,
            scope: token
          })
        : await this.coordinator.executeCommand({
            port: this.client,
            operation,
            input: {
              ...common,
              removePointerFile: typeof args.removePointerFile === "boolean" ? args.removePointerFile : undefined
            },
            ledger: this.operations,
            key,
            scope: token,
            prepareDispatch: (operationId) => prepareDestructiveDispatch(
              this.client,
              token.projectId,
              "memory.delete_repo",
              {
                ...common,
                removePointerFile: typeof args.removePointerFile === "boolean" ? args.removePointerFile : undefined
              },
              { signal: token.signal, idempotencyKey: operationId }
            )
          });
    if (result === undefined || !this.scope.isScopeCurrent(token)) return false;
    return this.scope.isScopeCurrent(token);
  }

  private async refreshSelectedProject(): Promise<void> {
    const token = this.scope.captureScope();
    if (token) await this.coordinator.refreshAll();
  }
}
