import { makeAutoObservable } from "mobx";
import type { SystemClientPort } from "../application/ports/features.js";
import type {
  ImportCommitResult,
  ImportConflictStrategy,
  ImportPlan,
  ImportProfile,
  TrashItem
} from "@zharwing/memory-core";
import { OperationLedger } from "../application/operations/operation-state.js";
import type {
  ScopedProjectPort,
  ScopeToken,
  StoreAsyncRuntimePort,
  SystemStoreCoordinator
} from "../application/operations/store-ports.js";
import type { ApplicationScopePort } from "../application/project-scope/project-scope-coordinator.js";
import {
  ResourceSlot,
  publicErrorCopy
} from "../application/resources/resource-state.js";
import { resourceReadModel } from "../application/resources/resource-read-model.js";
import { SystemBackupsStore } from "./system/system-backups-store.js";
import { SystemDiagnosticsStore } from "./system/system-diagnostics-store.js";
import { SystemImportStore } from "./system/system-import-store.js";
import { SystemTrashStore } from "./system/system-trash-store.js";
import type {
  BackupSnapshotItem,
  DaemonHealth,
  McpDoctor,
  McpInstallResult
} from "./system/system-types.js";

export type { BackupSnapshotItem } from "./system/system-types.js";

/**
 * Stable facade for system diagnostics, backups, trash, and imports.
 *
 * Feature owners share one operation ledger and the facade aliases their exact
 * resource slots, preserving the observable state and API used by the UI.
 */
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

  private readonly diagnostics: SystemDiagnosticsStore;
  private readonly backupsStore: SystemBackupsStore;
  private readonly trashStore: SystemTrashStore;
  private readonly importStore: SystemImportStore;

  constructor(
    client: SystemClientPort,
    private readonly scope: ScopedProjectPort,
    applicationScope: ApplicationScopePort,
    coordinator: SystemStoreCoordinator,
    runtime: StoreAsyncRuntimePort
  ) {
    this.operations = new OperationLedger(runtime);
    this.diagnostics = new SystemDiagnosticsStore(
      client,
      applicationScope,
      coordinator,
      this.operations,
      runtime
    );
    this.trashStore = new SystemTrashStore(
      client,
      scope,
      coordinator,
      this.operations,
      runtime
    );
    this.backupsStore = new SystemBackupsStore(
      client,
      scope,
      coordinator,
      this.operations,
      runtime
    );
    this.importStore = new SystemImportStore(
      client,
      scope,
      applicationScope,
      coordinator,
      this.operations,
      runtime
    );

    this.daemonHealthResource = this.diagnostics.daemonHealthResource;
    this.mcpDoctorResource = this.diagnostics.mcpDoctorResource;
    this.mcpInstallResource = this.diagnostics.mcpInstallResource;
    this.backupsResource = this.backupsStore.resource;
    this.trashResource = this.trashStore.resource;
    this.importProfilesResource = this.importStore.profilesResource;
    this.importPlanResource = this.importStore.planResource;
    this.importResultResource = this.importStore.resultResource;

    makeAutoObservable<
      this,
      "scope" | "diagnostics" | "backupsStore" | "trashStore" | "importStore" | "resources"
    >(this, {
      scope: false,
      diagnostics: false,
      backupsStore: false,
      trashStore: false,
      importStore: false,
      daemonHealthResource: false,
      mcpDoctorResource: false,
      mcpInstallResource: false,
      backupsResource: false,
      trashResource: false,
      importProfilesResource: false,
      importPlanResource: false,
      importResultResource: false,
      operations: false,
      resources: false
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

  get daemonHealthRead() { return resourceReadModel(this.daemonHealthResource); }
  get mcpDoctorRead() { return resourceReadModel(this.mcpDoctorResource); }
  get mcpInstallRead() { return resourceReadModel(this.mcpInstallResource); }
  get backupsRead() { return resourceReadModel(this.backupsResource); }
  get trashRead() { return resourceReadModel(this.trashResource); }
  get importProfilesRead() { return resourceReadModel(this.importProfilesResource); }
  get importPlanRead() { return resourceReadModel(this.importPlanResource); }
  get importResultRead() { return resourceReadModel(this.importResultResource); }

  get loading(): boolean {
    return this.resources.some((resource) => resource.loading) || this.operations.isBusy();
  }

  get error(): string {
    const resourceError = this.resources.find((resource) => resource.error)?.error;
    return publicErrorCopy(resourceError ?? this.operations.error);
  }

  /** Clear only data tied to the previous project; global diagnostics survive. */
  clear(): void {
    this.backupsStore.clear();
    this.trashResource.reset();
    this.importStore.clear();
    this.operations.resetScope(this.scope.captureScope());
  }

  async loadDaemonHealth(): Promise<void> {
    await this.diagnostics.loadDaemonHealth();
  }

  async loadMcpDoctor(): Promise<void> {
    await this.diagnostics.loadMcpDoctor();
  }

  async installMcpClient(
    client: "auto" | "codex" | "claude-code" | "claude-desktop",
    transport: "http" | "stdio" = "http"
  ): Promise<void> {
    await this.diagnostics.installMcpClient(client, transport);
  }

  async loadBackups(token = this.scope.captureScope()): Promise<void> {
    await this.backupsStore.load(token);
  }

  async createBackup(): Promise<void> {
    await this.backupsStore.create();
  }

  async deleteBackup(snapshotPath: string): Promise<void> {
    await this.backupsStore.delete(snapshotPath);
  }

  async loadTrash(token = this.scope.captureScope()): Promise<void> {
    await this.trashStore.load(token);
  }

  async restoreTrashItem(trashItemId: string): Promise<void> {
    await this.trashStore.restore(trashItemId);
  }

  async purgeTrashItem(trashItemId: string): Promise<void> {
    await this.trashStore.purge(trashItemId);
  }

  async emptyTrash(trashItemIds?: string[]): Promise<void> {
    await this.trashStore.empty(trashItemIds);
  }

  async loadImportProfiles(): Promise<void> {
    await this.importStore.loadProfiles();
  }

  async prepareImport(args: {
    sourceRoot: string;
    profile: string;
    limit?: number;
  }): Promise<void> {
    await this.importStore.prepare(args);
  }

  async commitImport(conflictStrategy: ImportConflictStrategy | string): Promise<void> {
    await this.importStore.commit(conflictStrategy);
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
}
