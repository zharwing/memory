import type { MemoryClient } from "@zharwing/memory-api-client";
import type { TrashItem } from "@zharwing/memory-core";
import { executeConfirmedDestructiveOperation } from "../../application/operations/destructive-operation.js";
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
    private readonly client: MemoryClient,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: Pick<SystemStoreCoordinator, "refreshProjects" | "refreshAll">,
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
    const operation = this.operations.begin("restore-trash-item", token);
    try {
      const result = await executeConfirmedDestructiveOperation(
        this.client,
        token.projectId,
        "memory.restore_trash_item",
        { projectId: token.projectId, trashItemId },
        { signal: token.signal }
      );
      this.operations.succeed(operation, result);
      // A restore can bring back any record type, so this is a full refresh.
      await this.coordinator.refreshProjects();
      await this.coordinator.refreshAll();
      await this.load();
    } catch (error) {
      this.operations.fail(operation, error);
    }
  }

  async purge(trashItemId: string): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const operation = this.operations.begin("purge-trash-item", token);
    try {
      const result = await executeConfirmedDestructiveOperation(
        this.client,
        token.projectId,
        "memory.purge_trash_item",
        { projectId: token.projectId, trashItemId },
        { signal: token.signal }
      );
      this.operations.succeed(operation, result);
      await this.load();
    } catch (error) {
      this.operations.fail(operation, error);
    }
  }

  async empty(trashItemIds?: string[]): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const operation = this.operations.begin("empty-trash", token);
    try {
      const result = await executeConfirmedDestructiveOperation(
        this.client,
        token.projectId,
        "memory.empty_trash",
        { projectId: token.projectId, trashItemIds },
        { signal: token.signal }
      );
      this.operations.succeed(operation, result);
      await this.load();
    } catch (error) {
      this.operations.fail(operation, error);
    }
  }
}
