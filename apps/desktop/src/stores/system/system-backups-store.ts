import type { SystemClientPort } from "../../application/ports/features.js";
import { prepareDestructiveDispatch } from "../../application/operations/destructive-operation.js";
import type { OperationLedger } from "../../application/operations/operation-state.js";
import type {
  ScopedProjectPort,
  ScopeToken,
  StoreAsyncRuntimePort,
  SystemStoreCoordinator
} from "../../application/operations/store-ports.js";
import { ResourceSlot } from "../../application/resources/resource-state.js";
import type { BackupSnapshotItem } from "./system-types.js";

/** Project-scoped backup listing and mutation behavior. */
export class SystemBackupsStore {
  readonly resource: ResourceSlot<BackupSnapshotItem[]>;

  constructor(
    private readonly client: SystemClientPort,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: Pick<SystemStoreCoordinator, "executeCommand">,
    private readonly operations: OperationLedger,
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
    await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.backup_project",
      input: { projectId: token.projectId },
      ledger: this.operations,
      key: "backup:create",
      scope: token
    });
  }

  async delete(snapshotPath: string): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const input = { projectId: token.projectId, snapshotPath };
    await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.delete_backup",
      input,
      ledger: this.operations,
      key: `backup:delete:${snapshotPath}`,
      scope: token,
      prepareDispatch: (operationId) => prepareDestructiveDispatch(
        this.client,
        token.projectId,
        "memory.delete_backup",
        input,
        { signal: token.signal, idempotencyKey: operationId }
      )
    });
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
}
