import type { SystemClientPort } from "../../application/ports/features.js";
import type { TrashItem } from "@zharwing/memory-core";
import { prepareDestructiveDispatch } from "../../application/operations/destructive-operation.js";
import type { OperationLedger } from "../../application/operations/operation-state.js";
import type {
  ScopedProjectPort,
  StoreAsyncRuntimePort,
  SystemStoreCoordinator
} from "../../application/operations/store-ports.js";
import { ResourceSlot } from "../../application/resources/resource-state.js";

/** Project-scoped trash listing, restore, purge, and empty behavior. */
export class SystemTrashStore {
  readonly resource: ResourceSlot<TrashItem[]>;

  constructor(
    private readonly client: SystemClientPort,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: Pick<SystemStoreCoordinator, "executeCommand">,
    private readonly operations: OperationLedger,
    runtime: StoreAsyncRuntimePort
  ) {
    this.resource = new ResourceSlot(scope, runtime);
  }

  async load(token = this.scope.captureScope()): Promise<void> {
    if (!token) {
      this.resource.reset();
      return;
    }
    const attempt = this.resource.begin(token);
    if (!attempt) return;
    try {
      const items = await this.client.operation("memory.list_trash", {
        projectId: token.projectId
      }, { signal: attempt.scope.signal });
      this.resource.succeed(attempt, items);
    } catch (error) {
      this.resource.fail(attempt, error);
    }
  }

  async restore(trashItemId: string): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const input = { projectId: token.projectId, trashItemId };
    await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.restore_trash_item",
      input,
      ledger: this.operations,
      key: `trash:restore:${trashItemId}`,
      scope: token,
      prepareDispatch: (operationId) => prepareDestructiveDispatch(
        this.client,
        token.projectId,
        "memory.restore_trash_item",
        input,
        { signal: token.signal, idempotencyKey: operationId }
      )
    });
  }

  async purge(trashItemId: string): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const input = { projectId: token.projectId, trashItemId };
    await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.purge_trash_item",
      input,
      ledger: this.operations,
      key: `trash:purge:${trashItemId}`,
      scope: token,
      prepareDispatch: (operationId) => prepareDestructiveDispatch(
        this.client,
        token.projectId,
        "memory.purge_trash_item",
        input,
        { signal: token.signal, idempotencyKey: operationId }
      )
    });
  }

  async empty(trashItemIds?: string[]): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const input = { projectId: token.projectId, trashItemIds };
    await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.empty_trash",
      input,
      ledger: this.operations,
      key: "trash:empty",
      scope: token,
      prepareDispatch: (operationId) => prepareDestructiveDispatch(
        this.client,
        token.projectId,
        "memory.empty_trash",
        input,
        { signal: token.signal, idempotencyKey: operationId }
      )
    });
  }
}
