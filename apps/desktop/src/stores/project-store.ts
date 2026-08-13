import { makeAutoObservable } from "mobx";
import type { MemoryClient } from "@zharwing/memory-api-client";
import { parseOperationInput } from "@zharwing/memory-core";
import type {
  MemoryWritePolicy,
  MemoryReviewMode,
  Project,
  ProjectCreationPreview,
  RepoLink,
  Session
} from "@zharwing/memory-core";
import {
  ProjectScopeCoordinator,
  createApplicationScopePort
} from "../application/project-scope/project-scope-coordinator.js";
import {
  OperationLedger,
  type OperationAttempt,
  type OperationState
} from "../application/operations/operation-state.js";
import { executeConfirmedDestructiveOperation } from "../application/operations/destructive-operation.js";
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
  readonly projectsResource: ResourceSlot<Project[]>;
  readonly summaryResource: ResourceSlot<ProjectSummarySnapshot>;
  readonly repoLinksResource: ResourceSlot<RepoLink[]>;
  readonly projectCreationPreviewResource: ResourceSlot<ProjectCreationPreview | undefined>;
  readonly operations: OperationLedger;

  constructor(
    private readonly client: MemoryClient,
    private readonly scope: ProjectScopeCoordinator,
    private readonly coordinator: ProjectStoreCoordinator,
    runtime: StoreAsyncRuntimePort
  ) {
    const applicationScope = createApplicationScopePort();
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

  async load(preferredProjectId?: string): Promise<void> {
    const attempt = this.projectsResource.begin();
    if (!attempt) return;
    try {
      const projects = await this.client.operation(
        "memory.list_projects",
        {},
        { signal: attempt.scope.signal }
      );
      if (!this.projectsResource.succeed(attempt, projects)) return;
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

  selectProject(projectId: string): boolean {
    const project = this.list.find((candidate) => candidate.id === projectId);
    if (!project) return false;
    const token = this.scope.activate(project.id, project.repos?.[0]?.path);
    if (!token) return false;
    this.coordinator.resetProjectTransient();
    void this.coordinator.refreshAll();
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
    const attempt = this.operations.begin("project:create");
    try {
      const project = await this.client.operation(
        "memory.create_project",
        { preview },
        { idempotencyKey: attempt.operationId }
      );
      if (!this.operations.succeed(attempt, project)) return false;
      await this.load(project.id);
      this.projectCreationPreviewResource.reset();
      if (this.selectedProjectId === project.id) await this.coordinator.refreshAll();
      return this.selectedProjectId === project.id;
    } catch (error) {
      this.operations.fail(attempt, error);
      return false;
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    const selectedToken = this.selectedProjectId === projectId ? this.scope.captureScope() : undefined;
    const attempt = this.operations.begin(`project:delete:${projectId}`);
    try {
      const result = await executeConfirmedDestructiveOperation(
        this.client,
        projectId,
        "memory.delete_project",
        { projectId },
        { idempotencyKey: attempt.operationId }
      );
      if (!this.operations.succeed(attempt, result)) return;
      if (selectedToken && this.scope.isScopeCurrent(selectedToken)) this.scope.clear();
      await this.load(this.selectedProjectId || undefined);
      if (this.selectedProjectId) await this.coordinator.refreshAll();
      await this.coordinator.refreshTrash();
    } catch (error) {
      this.operations.fail(attempt, error);
    }
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
    const result = await this.scopedMutation(
      "project:policy",
      token,
      (operationId) => this.client.operation("memory.update_memory_write_policy", input, {
        signal: token.signal,
        idempotencyKey: operationId
      })
    );
    if (result !== undefined && this.scope.isScopeCurrent(token)) {
      await Promise.all([this.load(), this.loadSummary(token)]);
    }
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
    const changed = await this.repoMutation("repo:delete", "memory.delete_repo", { repoPath, removePointerFile });
    if (changed) await this.coordinator.refreshTrash();
  }

  private async repoMutation(
    key: string,
    operation: "memory.link_repo" | "memory.unlink_repo" | "memory.delete_repo",
    args: Record<string, unknown>
  ): Promise<boolean> {
    const token = this.scope.captureScope();
    if (!token) return false;
    const result = await this.scopedMutation<unknown>(key, token, (operationId) => {
      const options = { signal: token.signal, idempotencyKey: operationId };
      if (operation === "memory.link_repo") {
        return this.client.operation(operation, {
          projectId: token.projectId,
          repoPath: String(args.repoPath),
          role: typeof args.role === "string" ? args.role : undefined,
          name: typeof args.name === "string" ? args.name : undefined,
          description: typeof args.description === "string" ? args.description : undefined,
          defaultBranch: typeof args.defaultBranch === "string" ? args.defaultBranch : undefined,
          writePointerFile: typeof args.writePointerFile === "boolean" ? args.writePointerFile : undefined
        }, options);
      }
      const input = {
        projectId: token.projectId,
        repoPath: String(args.repoPath),
        removePointerFile: typeof args.removePointerFile === "boolean" ? args.removePointerFile : undefined
      };
      return operation === "memory.unlink_repo"
        ? this.client.operation(operation, input, options)
        : executeConfirmedDestructiveOperation(this.client, token.projectId, "memory.delete_repo", input, options);
    });
    if (result === undefined || !this.scope.isScopeCurrent(token)) return false;
    await Promise.all([
      this.load(),
      this.loadSummary(token),
      this.loadRepoLinks(token),
      this.coordinator.refreshGraph()
    ]);
    return this.scope.isScopeCurrent(token);
  }

  private async scopedMutation<Result>(
    key: string,
    token: ScopeToken,
    work: (operationId: string) => Promise<Result>
  ): Promise<Result | undefined> {
    const attempt = this.operations.begin(key, token);
    try {
      const result = await work(attempt.operationId);
      if (!this.scope.isScopeCurrent(token) || !this.operations.succeed(attempt, result)) {
        this.operations.abandon(attempt);
        return undefined;
      }
      return result;
    } catch (error) {
      this.settleFailure(attempt, token, error);
      return undefined;
    }
  }

  private settleFailure(
    attempt: OperationAttempt,
    token: ScopeToken | undefined,
    error: unknown
  ): void {
    if (!token || this.scope.isScopeCurrent(token)) this.operations.fail(attempt, error);
    else this.operations.abandon(attempt);
  }
}
