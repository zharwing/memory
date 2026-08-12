import { makeAutoObservable } from "mobx";
import type { MemoryClient } from "@zharwing/memory-api-client";
import type { ProposedMemoryUpdate, ProposedUpdateStatus } from "@zharwing/memory-core";
import { OperationLedger } from "../application/operations/operation-state.js";
import { executeConfirmedDestructiveOperation } from "../application/operations/destructive-operation.js";
import type {
  InboxStoreCoordinator,
  ScopedProjectPort,
  ScopeToken,
  StoreAsyncRuntimePort
} from "../application/operations/store-ports.js";
import {
  ResourceSlot,
  publicErrorCopy
} from "../application/resources/resource-state.js";

export class InboxStore {
  readonly inboxResource: ResourceSlot<ProposedMemoryUpdate[]>;
  readonly operations: OperationLedger;

  constructor(
    private readonly client: MemoryClient,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: InboxStoreCoordinator,
    runtime: StoreAsyncRuntimePort
  ) {
    this.inboxResource = new ResourceSlot(scope, runtime);
    this.operations = new OperationLedger(runtime);
    makeAutoObservable<this, "client" | "scope" | "coordinator">(this, {
      client: false,
      scope: false,
      coordinator: false,
      inboxResource: false,
      operations: false
    });
  }

  get items(): ProposedMemoryUpdate[] {
    return this.inboxResource.data ?? [];
  }

  get loading(): boolean {
    return this.inboxResource.loading || this.operations.isBusy();
  }

  get error(): string {
    return publicErrorCopy(this.inboxResource.error ?? this.operations.error);
  }

  clear(): void {
    this.inboxResource.reset();
    this.operations.reset();
  }

  /** Used by semantic analysis; also supersedes an older list request. */
  replace(items: ProposedMemoryUpdate[]): void {
    const attempt = this.inboxResource.begin();
    if (attempt) this.inboxResource.succeed(attempt, items);
  }

  async load(token = this.scope.captureScope()): Promise<void> {
    if (!token) {
      this.inboxResource.reset();
      return;
    }
    await this.loadFor(token);
  }

  async deleteItem(proposalId: string): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const operation = this.operations.begin("delete-inbox-item", token);
    try {
      const result = await executeConfirmedDestructiveOperation(this.client, token.projectId, "memory.delete_inbox_item", {
        projectId: token.projectId,
        proposalId
      }, { signal: token.signal });
      if (!this.scope.isScopeCurrent(token)) {
        this.operations.abandon(operation);
        return;
      }
      this.operations.succeed(operation, result);
      await this.loadFor(token);
      if (!this.scope.isScopeCurrent(token)) return;
      await this.coordinator.refreshProjectSummary();
      if (this.scope.isScopeCurrent(token)) await this.coordinator.refreshTrash();
    } catch (error) {
      this.settleScopedFailure(operation, token, error);
    }
  }

  async updateStatus(
    proposalId: string,
    status: ProposedUpdateStatus,
    editedPatch?: string
  ): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const operation = this.operations.begin("update-inbox-status", token);
    try {
      const result = await this.client.operation("memory.update_inbox_status", {
        projectId: token.projectId,
        proposalId,
        status,
        editedPatch
      }, { signal: token.signal });
      if (!this.scope.isScopeCurrent(token)) {
        this.operations.abandon(operation);
        return;
      }
      this.operations.succeed(operation, result);
      // Accepted proposals can patch docs and graph rules, so refresh those too.
      await this.loadFor(token);
      if (!this.scope.isScopeCurrent(token)) return;
      await this.coordinator.refreshProjectSummary();
      if (!this.scope.isScopeCurrent(token)) return;
      await this.coordinator.refreshDocs();
      if (this.scope.isScopeCurrent(token)) await this.coordinator.refreshGraph();
    } catch (error) {
      this.settleScopedFailure(operation, token, error);
    }
  }

  private async loadFor(token: ScopeToken): Promise<void> {
    const attempt = this.inboxResource.begin(token);
    if (!attempt) return;
    try {
      const inbox = await this.client.operation("memory.list_inbox", {
        projectId: token.projectId
      }, { signal: token.signal });
      this.inboxResource.succeed(attempt, inbox);
    } catch (error) {
      this.inboxResource.fail(attempt, error);
    }
  }

  private settleScopedFailure(
    operation: ReturnType<OperationLedger["begin"]>,
    token: ScopeToken,
    error: unknown
  ): void {
    if (!this.scope.isScopeCurrent(token)) {
      this.operations.abandon(operation);
      return;
    }
    this.operations.fail(operation, error);
  }
}
