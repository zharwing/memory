import type { MemoryClient } from "@zharwing/memory-api-client";
import { executeConfirmedDestructiveOperation } from "../../application/operations/destructive-operation.js";
import type { OperationLedger } from "../../application/operations/operation-state.js";
import type {
  ScopedProjectPort,
  ScopeToken,
  StoreAsyncRuntimePort
} from "../../application/operations/store-ports.js";
import { ResourceSlot } from "../../application/resources/resource-state.js";
import type { BackupSnapshotItem } from "./system-types.js";

/** Project-scoped backup listing and mutation behavior. */
export class SystemBackupsStore {
  readonly resource: ResourceSlot<BackupSnapshotItem[]>;

  constructor(
    private readonly client: MemoryClient,
    private readonly scope: ScopedProjectPort,
    private readonly operations: OperationLedger,
    private readonly refreshTrash: () => Promise<void>,
    runtime: StoreAsyncRuntimePort
  ) {
    this.resource = new ResourceSlot(scope, runtime);
  }

  clear(): void {
    this.resource.reset();
  }

  async load(token = this.scope.captureScope()): Promise<void> {
    if (!token) {
      this.resource.reset();
      return;
    }
    await this.loadFor(token);
  }

  async create(): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const operation = this.operations.begin("create-backup", token);
    try {
      const result = await this.client.operation("memory.backup_project", {
        projectId: token.projectId
      }, { signal: token.signal });
      if (!this.scope.isScopeCurrent(token)) {
        this.operations.abandon(operation);
        return;
      }
      this.operations.succeed(operation, result);
      await this.loadFor(token);
    } catch (error) {
      this.settleScopedFailure(operation, token, error);
    }
  }

  async delete(snapshotPath: string): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const operation = this.operations.begin("delete-backup", token);
    try {
      const result = await executeConfirmedDestructiveOperation(
        this.client,
        token.projectId,
        "memory.delete_backup",
        { projectId: token.projectId, snapshotPath },
        { signal: token.signal }
      );
      if (!this.scope.isScopeCurrent(token)) {
        this.operations.abandon(operation);
        return;
      }
      this.operations.succeed(operation, result);
      await this.loadFor(token);
      if (this.scope.isScopeCurrent(token)) await this.refreshTrash();
    } catch (error) {
      this.settleScopedFailure(operation, token, error);
    }
  }

  private async loadFor(token: ScopeToken): Promise<void> {
    const attempt = this.resource.begin(token);
    if (!attempt) return;
    try {
      const backups = await this.client.operation("memory.list_backups", {
        projectId: token.projectId
      }, { signal: token.signal });
      this.resource.succeed(attempt, backups);
    } catch (error) {
      this.resource.fail(attempt, error);
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
