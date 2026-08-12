import { makeAutoObservable } from "mobx";
import type { MemoryClient } from "@zharwing/memory-api-client";
import { parseOperationInput } from "@zharwing/memory-core";
import type {
  ImportCommitResult,
  ImportConflictStrategy,
  ImportPlan,
  ImportProfile,
  OperationOutput,
  TrashItem
} from "@zharwing/memory-core";
import { OperationLedger } from "../application/operations/operation-state.js";
import { executeConfirmedDestructiveOperation } from "../application/operations/destructive-operation.js";
import type {
  ScopedProjectPort,
  ScopeToken,
  StoreAsyncRuntimePort,
  SystemStoreCoordinator
} from "../application/operations/store-ports.js";
import { createApplicationScopePort } from "../application/project-scope/project-scope-coordinator.js";
import {
  ResourceSlot,
  publicErrorCopy
} from "../application/resources/resource-state.js";

/** Result shape of `memory.list_backups`. */
export interface BackupSnapshotItem {
  projectId: string;
  created: string;
  snapshotPath: string;
  note: string;
}

type DaemonHealth = OperationOutput<"memory.health">;
type McpDoctor = OperationOutput<"memory.mcp_doctor">;
type McpInstallResult = OperationOutput<"memory.mcp_install">;

/** Daemon health, MCP install/doctor, backups, trash, and bulk import. */
export class SystemStore {
  readonly daemonHealthResource: ResourceSlot<DaemonHealth>;
  readonly mcpDoctorResource: ResourceSlot<McpDoctor>;
  readonly mcpInstallResource: ResourceSlot<McpInstallResult>;
  readonly backupsResource: ResourceSlot<BackupSnapshotItem[]>;
  readonly trashResource: ResourceSlot<TrashItem[]>;
  readonly importProfilesResource: ResourceSlot<ImportProfile[]>;
  readonly importPlanResource: ResourceSlot<ImportPlan>;
  readonly importResultResource: ResourceSlot<ImportCommitResult>;
  readonly operations: OperationLedger;

  constructor(
    private readonly client: MemoryClient,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: SystemStoreCoordinator,
    runtime: StoreAsyncRuntimePort
  ) {
    const applicationScope = createApplicationScopePort();
    this.daemonHealthResource = new ResourceSlot(applicationScope, runtime);
    this.mcpDoctorResource = new ResourceSlot(applicationScope, runtime);
    this.mcpInstallResource = new ResourceSlot(applicationScope, runtime);
    this.backupsResource = new ResourceSlot(scope, runtime);
    this.trashResource = new ResourceSlot(scope, runtime);
    this.importProfilesResource = new ResourceSlot(applicationScope, runtime);
    this.importPlanResource = new ResourceSlot(scope, runtime);
    this.importResultResource = new ResourceSlot(scope, runtime);
    this.operations = new OperationLedger(runtime);
    makeAutoObservable<this, "client" | "scope" | "coordinator">(this, {
      client: false,
      scope: false,
      coordinator: false,
      daemonHealthResource: false,
      mcpDoctorResource: false,
      mcpInstallResource: false,
      backupsResource: false,
      trashResource: false,
      importProfilesResource: false,
      importPlanResource: false,
      importResultResource: false,
      operations: false
    });
  }

  get daemonHealth(): DaemonHealth | undefined {
    return this.daemonHealthResource.data;
  }

  get mcpDoctor(): McpDoctor | undefined {
    return this.mcpDoctorResource.data;
  }

  get mcpInstallResult(): McpInstallResult | undefined {
    return this.mcpInstallResource.data;
  }

  get backups(): BackupSnapshotItem[] {
    return this.backupsResource.data ?? [];
  }

  get trashItems(): TrashItem[] {
    return this.trashResource.data ?? [];
  }

  get importProfiles(): ImportProfile[] {
    return this.importProfilesResource.data ?? [];
  }

  get importPlan(): ImportPlan | undefined {
    return this.importPlanResource.data;
  }

  get importResult(): ImportCommitResult | undefined {
    return this.importResultResource.data;
  }

  get loading(): boolean {
    return this.resources.some((resource) => resource.loading) || this.operations.isBusy();
  }

  get error(): string {
    const resourceError = this.resources.find((resource) => resource.error)?.error;
    return publicErrorCopy(resourceError ?? this.operations.error);
  }

  /** Clear only data tied to the previous project; global diagnostics survive. */
  clear(): void {
    this.backupsResource.reset();
    this.importPlanResource.reset();
    this.importResultResource.reset();
    this.operations.resetScope(this.scope.captureScope());
  }

  async loadDaemonHealth(): Promise<void> {
    const attempt = this.daemonHealthResource.begin();
    if (!attempt) return;
    try {
      const health = await this.client.operation("memory.health", {}, {
        signal: attempt.scope.signal
      });
      this.daemonHealthResource.succeed(attempt, health);
    } catch (error) {
      this.daemonHealthResource.fail(attempt, error);
    }
  }

  async loadMcpDoctor(): Promise<void> {
    const attempt = this.mcpDoctorResource.begin();
    if (!attempt) return;
    try {
      const result = await this.client.operation("memory.mcp_doctor", {}, {
        signal: attempt.scope.signal
      });
      this.mcpDoctorResource.succeed(attempt, result);
    } catch (error) {
      this.mcpDoctorResource.fail(attempt, error);
    }
  }

  async installMcpClient(
    client: "auto" | "codex" | "claude-code" | "claude-desktop",
    transport: "http" | "stdio" = "http"
  ): Promise<void> {
    const resourceAttempt = this.mcpInstallResource.begin();
    if (!resourceAttempt) return;
    const operation = this.operations.begin("install-mcp-client");
    try {
      const result = await this.client.operation("memory.mcp_install", {
        client,
        transport,
        authMode: "auto"
      }, { signal: resourceAttempt.scope.signal });
      this.operations.succeed(operation, result);
      this.mcpInstallResource.succeed(resourceAttempt, result);
      await this.loadMcpDoctor();
    } catch (error) {
      this.operations.fail(operation, error);
      this.mcpInstallResource.fail(resourceAttempt, error);
    }
  }

  async loadBackups(token = this.scope.captureScope()): Promise<void> {
    if (!token) {
      this.backupsResource.reset();
      return;
    }
    await this.loadBackupsFor(token);
  }

  async createBackup(): Promise<void> {
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
      await this.loadBackupsFor(token);
    } catch (error) {
      this.settleScopedFailure(operation, token, error);
    }
  }

  async deleteBackup(snapshotPath: string): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const operation = this.operations.begin("delete-backup", token);
    try {
      const result = await executeConfirmedDestructiveOperation(this.client, token.projectId, "memory.delete_backup", {
        projectId: token.projectId,
        snapshotPath
      }, { signal: token.signal });
      if (!this.scope.isScopeCurrent(token)) {
        this.operations.abandon(operation);
        return;
      }
      this.operations.succeed(operation, result);
      await this.loadBackupsFor(token);
      if (this.scope.isScopeCurrent(token)) await this.loadTrash();
    } catch (error) {
      this.settleScopedFailure(operation, token, error);
    }
  }

  async loadTrash(token = this.scope.captureScope()): Promise<void> {
    if (!token) {
      this.trashResource.reset();
      return;
    }
    const attempt = this.trashResource.begin(token);
    if (!attempt) return;
    try {
      const items = await this.client.operation("memory.list_trash", { projectId: token.projectId }, {
        signal: attempt.scope.signal
      });
      this.trashResource.succeed(attempt, items);
    } catch (error) {
      this.trashResource.fail(attempt, error);
    }
  }

  async restoreTrashItem(trashItemId: string): Promise<void> {
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
      await this.loadTrash();
    } catch (error) {
      this.operations.fail(operation, error);
    }
  }

  async purgeTrashItem(trashItemId: string): Promise<void> {
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
      await this.loadTrash();
    } catch (error) {
      this.operations.fail(operation, error);
    }
  }

  async emptyTrash(trashItemIds?: string[]): Promise<void> {
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
      await this.loadTrash();
    } catch (error) {
      this.operations.fail(operation, error);
    }
  }

  async loadImportProfiles(): Promise<void> {
    const attempt = this.importProfilesResource.begin();
    if (!attempt) return;
    try {
      const profiles = await this.client.operation("memory.list_import_profiles", {}, {
        signal: attempt.scope.signal
      });
      this.importProfilesResource.succeed(attempt, profiles);
    } catch (error) {
      this.importProfilesResource.fail(attempt, error);
    }
  }

  async prepareImport(args: {
    sourceRoot: string;
    profile: string;
    limit?: number;
  }): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const attempt = this.importPlanResource.begin(token);
    if (!attempt) return;
    this.importResultResource.reset();
    try {
      const plan = await this.client.operation("memory.prepare_import", {
        projectId: token.projectId,
        sourceRoot: args.sourceRoot,
        profile: args.profile,
        limit: args.limit
      }, { signal: token.signal });
      this.importPlanResource.succeed(attempt, plan);
    } catch (error) {
      this.importPlanResource.fail(attempt, error);
    }
  }

  async commitImport(conflictStrategy: ImportConflictStrategy | string): Promise<void> {
    const token = this.scope.captureScope();
    const plan = this.importPlan;
    if (!token || !plan) return;
    const resourceAttempt = this.importResultResource.begin(token);
    if (!resourceAttempt) return;
    const operation = this.operations.begin("commit-import", token);
    try {
      const input = parseOperationInput("memory.commit_import", {
        projectId: token.projectId,
        plan,
        conflictStrategy
      });
      const result = await this.client.operation("memory.commit_import", input, {
        signal: token.signal
      });
      if (!this.scope.isScopeCurrent(token)) {
        this.operations.abandon(operation);
        return;
      }
      this.operations.succeed(operation, result);
      this.importResultResource.succeed(resourceAttempt, result);
      await this.coordinator.refreshDocs();
      if (!this.scope.isScopeCurrent(token)) return;
      await this.coordinator.refreshSessions();
      if (!this.scope.isScopeCurrent(token)) return;
      await this.coordinator.refreshProjectSummary();
      if (this.scope.isScopeCurrent(token)) await this.coordinator.refreshGraph();
    } catch (error) {
      if (!this.scope.isScopeCurrent(token)) {
        this.operations.abandon(operation);
        return;
      }
      this.operations.fail(operation, error);
      this.importResultResource.fail(resourceAttempt, error);
    }
  }

  private get resources(): Array<ResourceSlot<unknown>> {
    return [
      this.daemonHealthResource,
      this.mcpDoctorResource,
      this.mcpInstallResource,
      this.backupsResource,
      this.trashResource,
      this.importProfilesResource,
      this.importPlanResource,
      this.importResultResource
    ] as Array<ResourceSlot<unknown>>;
  }

  private async loadBackupsFor(token: ScopeToken): Promise<void> {
    const attempt = this.backupsResource.begin(token);
    if (!attempt) return;
    try {
      const backups = await this.client.operation("memory.list_backups", {
        projectId: token.projectId
      }, { signal: token.signal });
      this.backupsResource.succeed(attempt, backups);
    } catch (error) {
      this.backupsResource.fail(attempt, error);
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
