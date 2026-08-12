import { makeAutoObservable } from "mobx";
import type { MemoryClient } from "@zharwing/memory-api-client";
import type { Workstream, WorkstreamDetail, WorkstreamStatus } from "@zharwing/memory-core";
import {
  OperationLedger,
  type OperationAttempt,
  type OperationState
} from "../application/operations/operation-state.js";
import { executeConfirmedDestructiveOperation } from "../application/operations/destructive-operation.js";
import type {
  ScopedProjectPort,
  ScopeToken,
  StoreAsyncRuntimePort,
  WorkstreamStoreCoordinator
} from "../application/operations/store-ports.js";
import {
  ResourceSlot,
  publicErrorCopy,
  type ResourceState
} from "../application/resources/resource-state.js";

export class WorkstreamStore {
  readonly listResource: ResourceSlot<Workstream[]>;
  readonly detailResource: ResourceSlot<WorkstreamDetail | undefined>;
  readonly operations: OperationLedger;
  selectedWorkstreamId = "";

  constructor(
    private readonly client: MemoryClient,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: WorkstreamStoreCoordinator,
    runtime: StoreAsyncRuntimePort
  ) {
    this.listResource = new ResourceSlot(scope, runtime);
    this.detailResource = new ResourceSlot(scope, runtime);
    this.operations = new OperationLedger(runtime);
    makeAutoObservable<this, "client" | "scope" | "coordinator">(this, {
      client: false,
      scope: false,
      coordinator: false,
      listResource: false,
      detailResource: false,
      operations: false
    });
  }

  get listState(): ResourceState<Workstream[]> {
    return this.listResource.state;
  }

  get detailState(): ResourceState<WorkstreamDetail | undefined> {
    return this.detailResource.state;
  }

  get list(): Workstream[] {
    return this.listResource.data ?? [];
  }

  get detail(): WorkstreamDetail | undefined {
    return this.detailResource.data;
  }

  get loading(): boolean {
    return this.listResource.loading || this.detailResource.loading || this.operations.isBusy();
  }

  get error(): string {
    return publicErrorCopy(
      this.listResource.error ?? this.detailResource.error ?? this.operations.error
    );
  }

  operationState(key: string): OperationState {
    return this.operations.state(key);
  }

  clear(): void {
    this.listResource.reset();
    this.detailResource.reset();
    this.operations.reset();
    this.selectedWorkstreamId = "";
  }

  async load(token = this.scope.captureScope()): Promise<void> {
    const attempt = this.listResource.begin(token);
    if (!attempt) return;
    try {
      const workstreams = await this.client.operation(
        "memory.list_workstreams",
        { projectId: attempt.scope.projectId },
        { signal: attempt.scope.signal }
      );
      if (this.listResource.succeed(attempt, workstreams)) {
        const selectionExists = workstreams.some(
          (workstream) => workstream.id === this.selectedWorkstreamId
        );
        if (!selectionExists) {
          this.selectedWorkstreamId = workstreams[0]?.id ?? "";
          this.detailResource.reset();
        }
      }
    } catch (error) {
      this.listResource.fail(attempt, error);
    }
  }

  async createWorkstream(args: {
    name: string;
    summary?: string;
    goal?: string;
    topics?: string[];
    repoRoles?: string[];
    relatedTasks?: string[];
    relatedFiles?: string[];
  }): Promise<void> {
    const completed = await this.mutate(
      "workstream:create",
      (token, operationId) => this.client.operation(
        "memory.create_workstream",
        { projectId: token.projectId, ...args },
        { signal: token.signal, idempotencyKey: operationId }
      )
    );
    if (!completed) return;
    const { result: created, token } = completed;
    if (!this.scope.isScopeCurrent(token)) return;
    await this.load(token);
    if (!this.scope.isScopeCurrent(token)) return;
    this.selectedWorkstreamId = created.id;
    await this.loadDetail(created.id, token);
  }

  async selectWorkstream(workstreamId: string): Promise<void> {
    this.selectedWorkstreamId = workstreamId;
    this.detailResource.reset();
    await this.loadDetail(workstreamId);
  }

  async loadDetail(
    workstreamId = this.selectedWorkstreamId,
    token = this.scope.captureScope()
  ): Promise<void> {
    if (!workstreamId) return;
    const attempt = this.detailResource.begin(token);
    if (!attempt) return;
    try {
      const detail = await this.client.operation(
        "memory.get_workstream_detail",
        { projectId: attempt.scope.projectId, workstreamId },
        { signal: attempt.scope.signal }
      );
      if (this.detailResource.succeed(attempt, detail)) this.selectedWorkstreamId = workstreamId;
    } catch (error) {
      this.detailResource.fail(attempt, error);
    }
  }

  async updateStatus(workstreamId: string, status: WorkstreamStatus): Promise<void> {
    const completed = await this.mutate(
      `workstream:status:${workstreamId}`,
      (token, operationId) => this.client.operation(
        "memory.update_workstream_status",
        { projectId: token.projectId, workstreamId, status },
        { signal: token.signal, idempotencyKey: operationId }
      )
    );
    if (!completed) return;
    const { token } = completed;
    if (!this.scope.isScopeCurrent(token)) return;
    await Promise.all([
      this.load(token),
      this.selectedWorkstreamId === workstreamId
        ? this.loadDetail(workstreamId, token)
        : Promise.resolve()
    ]);
  }

  async deleteWorkstream(workstreamId: string): Promise<void> {
    const completed = await this.mutate(
      `workstream:delete:${workstreamId}`,
      (token, operationId) => executeConfirmedDestructiveOperation(
        this.client,
        token.projectId,
        "memory.delete_workstream",
        { projectId: token.projectId, workstreamId },
        { signal: token.signal, idempotencyKey: operationId }
      )
    );
    if (!completed) return;
    const { token } = completed;
    if (!this.scope.isScopeCurrent(token)) return;
    if (this.selectedWorkstreamId === workstreamId) {
      this.selectedWorkstreamId = "";
      this.detailResource.reset();
    }
    await Promise.all([
      this.load(token),
      this.coordinator.refreshProjectSummary(),
      this.coordinator.refreshGraph(),
      this.coordinator.refreshTrash()
    ]);
  }

  private async mutate<Result>(
    key: string,
    work: (token: ScopeToken, operationId: string) => Promise<Result>
  ): Promise<{ readonly result: Result; readonly token: ScopeToken } | undefined> {
    const token = this.scope.captureScope();
    if (!token) return undefined;
    const attempt = this.operations.begin(key, token);
    try {
      const result = await work(token, attempt.operationId);
      if (!this.scope.isScopeCurrent(token) || !this.operations.succeed(attempt, result)) {
        this.operations.abandon(attempt);
        return undefined;
      }
      return { result, token };
    } catch (error) {
      this.settleFailure(attempt, token, error);
      return undefined;
    }
  }

  private settleFailure(attempt: OperationAttempt, token: ScopeToken, error: unknown): void {
    if (this.scope.isScopeCurrent(token)) this.operations.fail(attempt, error);
    else this.operations.abandon(attempt);
  }
}
