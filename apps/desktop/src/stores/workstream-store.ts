import { makeAutoObservable } from "mobx";
import type { WorkstreamsClientPort } from "../application/ports/features.js";
import type { Workstream, WorkstreamDetail, WorkstreamStatus } from "@zharwing/memory-core";
import {
  OperationLedger,
  type OperationAttempt,
  type OperationState
} from "../application/operations/operation-state.js";
import { prepareDestructiveDispatch } from "../application/operations/destructive-operation.js";
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
import {
  createWorkstreamDetailSnapshot,
  type WorkstreamDetailSnapshot
} from "../application/read-models/workstream-detail-snapshot.js";
import { resourceReadModel } from "../application/resources/resource-read-model.js";

export class WorkstreamStore {
  readonly listResource: ResourceSlot<Workstream[]>;
  readonly detailResource: ResourceSlot<WorkstreamDetailSnapshot | undefined>;
  readonly operations: OperationLedger;
  selectedWorkstreamId = "";

  constructor(
    private readonly client: WorkstreamsClientPort,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: WorkstreamStoreCoordinator,
    private readonly runtime: StoreAsyncRuntimePort
  ) {
    this.listResource = new ResourceSlot(scope, runtime);
    this.detailResource = new ResourceSlot(scope, runtime);
    this.operations = new OperationLedger(runtime);
    makeAutoObservable<this, "client" | "scope" | "coordinator" | "runtime">(this, {
      client: false,
      scope: false,
      coordinator: false,
      runtime: false,
      listResource: false,
      detailResource: false,
      operations: false
    });
  }

  get listState(): ResourceState<Workstream[]> {
    return this.listResource.state;
  }

  get detailState(): ResourceState<WorkstreamDetailSnapshot | undefined> {
    return this.detailResource.state;
  }

  get listRead() {
    return resourceReadModel(this.listResource);
  }

  get detailRead() {
    return resourceReadModel(this.detailResource);
  }

  get list(): Workstream[] {
    return this.listResource.data ?? [];
  }

  get detail(): WorkstreamDetail | undefined {
    return this.detailResource.data?.detail;
  }

  get detailSnapshot(): WorkstreamDetailSnapshot | undefined {
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
    const token = this.scope.captureScope();
    if (!token) return;
    const created = await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.create_workstream",
      input: { projectId: token.projectId, ...args },
      ledger: this.operations,
      key: "workstream:create",
      scope: token
    });
    if (!created) return;
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
      const snapshot = createWorkstreamDetailSnapshot(
        detail,
        attempt.requestId,
        this.runtime.now()
      );
      if (this.detailResource.succeed(attempt, snapshot)) this.selectedWorkstreamId = workstreamId;
    } catch (error) {
      this.detailResource.fail(attempt, error);
    }
  }

  async updateStatus(workstreamId: string, status: WorkstreamStatus): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const updated = await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.update_workstream_status",
      input: { projectId: token.projectId, workstreamId, status },
      ledger: this.operations,
      key: `workstream:status:${workstreamId}`,
      scope: token
    });
    if (!updated) return;
    if (!this.scope.isScopeCurrent(token)) return;
    if (this.selectedWorkstreamId === workstreamId) await this.loadDetail(workstreamId, token);
  }

  async deleteWorkstream(workstreamId: string): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const input = { projectId: token.projectId, workstreamId };
    const deleted = await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.delete_workstream",
      input,
      ledger: this.operations,
      key: `workstream:delete:${workstreamId}`,
      scope: token,
      prepareDispatch: (operationId) => prepareDestructiveDispatch(
        this.client,
        token.projectId,
        "memory.delete_workstream",
        input,
        { signal: token.signal, idempotencyKey: operationId }
      )
    });
    if (!deleted) return;
    if (!this.scope.isScopeCurrent(token)) return;
    if (this.selectedWorkstreamId === workstreamId) {
      this.selectedWorkstreamId = "";
      this.detailResource.reset();
    }
  }
}
