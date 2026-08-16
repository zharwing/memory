import { makeAutoObservable } from "mobx";
import type { InboxClientPort } from "../application/ports/features.js";
import type { ProposedMemoryUpdate, ProposedUpdateStatus } from "@zharwing/memory-core";
import { OperationLedger } from "../application/operations/operation-state.js";
import { prepareDestructiveDispatch } from "../application/operations/destructive-operation.js";
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
import { resourceReadModel } from "../application/resources/resource-read-model.js";

export class InboxStore {
  readonly inboxResource: ResourceSlot<ProposedMemoryUpdate[]>;
  readonly operations: OperationLedger;

  constructor(
    private readonly client: InboxClientPort,
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

  get itemsRead() { return resourceReadModel(this.inboxResource); }

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
    const input = { projectId: token.projectId, proposalId };
    await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.delete_inbox_item",
      input,
      ledger: this.operations,
      key: "delete-inbox-item",
      scope: token,
      prepareDispatch: (operationId) => prepareDestructiveDispatch(
        this.client,
        token.projectId,
        "memory.delete_inbox_item",
        input,
        { signal: token.signal, idempotencyKey: operationId }
      )
    });
  }

  async updateStatus(
    proposalId: string,
    status: ProposedUpdateStatus,
    editedPatch?: string
  ): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.update_inbox_status",
      input: {
        projectId: token.projectId,
        proposalId,
        status,
        editedPatch
      },
      ledger: this.operations,
      key: "update-inbox-status",
      scope: token
    });
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

}
