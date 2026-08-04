import { makeAutoObservable, runInAction } from "mobx";
import type { ZharwingMemoryClient } from "@zharwing/memory-api-client";
import type {
  ImportCommitResult,
  ImportPlan,
  ImportProfile,
  TrashItem
} from "@zharwing/memory-core";
import type { RootStore } from "./root-store.js";

/** Result shape of `memory.list_backups`. */
export interface BackupSnapshotItem {
  projectId: string;
  created: string;
  snapshotPath: string;
  note: string;
}

/** Daemon health, MCP install/doctor, backups, trash, and bulk import. */
export class SystemStore {
  daemonHealth: { status: string; memoryRoot: string } | undefined = undefined;
  mcpDoctor: any = undefined;
  mcpInstallResult: any = undefined;
  backups: BackupSnapshotItem[] = [];
  trashItems: TrashItem[] = [];
  importProfiles: ImportProfile[] = [];
  importPlan: ImportPlan | undefined = undefined;
  importResult: ImportCommitResult | undefined = undefined;
  loading = false;
  error = "";

  constructor(
    readonly client: ZharwingMemoryClient,
    readonly root: RootStore
  ) {
    makeAutoObservable(this, {
      client: false,
      root: false
    });
  }

  private get projectId() {
    return this.root.projects.selectedProjectId;
  }

  async loadDaemonHealth() {
    await this.run(async () => {
      const health = await this.client.call<{ status: string; memoryRoot: string }>("memory.health");
      runInAction(() => {
        this.daemonHealth = health;
      });
    });
  }

  async loadMcpDoctor() {
    await this.run(async () => {
      const result = await this.client.call("memory.mcp_doctor");
      runInAction(() => {
        this.mcpDoctor = result;
      });
    });
  }

  async installMcpClient(client: "auto" | "codex" | "claude-code" | "claude-desktop", transport = "http") {
    await this.run(async () => {
      const result = await this.client.call("memory.mcp_install", {
        client,
        transport,
        authMode: "auto"
      });
      runInAction(() => {
        this.mcpInstallResult = result;
      });
      await this.loadMcpDoctor();
    });
  }

  async loadBackups() {
    if (!this.projectId) return;
    await this.run(async () => {
      const backups = await this.client.call<BackupSnapshotItem[]>("memory.list_backups", {
        projectId: this.projectId
      });
      runInAction(() => {
        this.backups = backups;
      });
    });
  }

  async createBackup() {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.backup_project", { projectId: this.projectId });
      await this.loadBackups();
    });
  }

  async deleteBackup(snapshotPath: string) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.delete_backup", {
        projectId: this.projectId,
        snapshotPath
      });
      await this.loadBackups();
      await this.loadTrash();
    });
  }

  async loadTrash() {
    await this.run(async () => {
      const items = await this.client.call<TrashItem[]>("memory.list_trash");
      runInAction(() => {
        this.trashItems = items;
      });
    });
  }

  async restoreTrashItem(trashItemId: string) {
    await this.run(async () => {
      await this.client.call("memory.restore_trash_item", { trashItemId });
      // A restore can bring back any record type, so this is a full refresh.
      await this.root.projects.load();
      await this.root.refreshAll();
      await this.loadTrash();
    });
  }

  async purgeTrashItem(trashItemId: string) {
    await this.run(async () => {
      await this.client.call("memory.purge_trash_item", { trashItemId });
      await this.loadTrash();
    });
  }

  async emptyTrash(trashItemIds?: string[]) {
    await this.run(async () => {
      await this.client.call("memory.empty_trash", { trashItemIds });
      await this.loadTrash();
    });
  }

  async loadImportProfiles() {
    await this.run(async () => {
      const profiles = await this.client.call<ImportProfile[]>("memory.list_import_profiles");
      runInAction(() => {
        this.importProfiles = profiles;
      });
    });
  }

  async prepareImport(args: {
    sourceRoot: string;
    profile: string;
    limit?: number;
  }) {
    if (!this.projectId) return;
    await this.run(async () => {
      const plan = await this.client.call<ImportPlan>("memory.prepare_import", {
        projectId: this.projectId,
        sourceRoot: args.sourceRoot,
        profile: args.profile,
        limit: args.limit
      });
      runInAction(() => {
        this.importPlan = plan;
        this.importResult = undefined;
      });
    });
  }

  async commitImport(conflictStrategy: string) {
    if (!this.projectId || !this.importPlan) return;
    await this.run(async () => {
      const result = await this.client.call<ImportCommitResult>("memory.commit_import", {
        projectId: this.projectId,
        plan: this.importPlan,
        conflictStrategy
      });
      await this.root.docs.load();
      await this.root.sessions.load();
      await this.root.projects.loadSummary();
      await this.root.graph.load();
      runInAction(() => {
        this.importResult = result;
      });
    });
  }

  private async run(work: () => Promise<void>) {
    this.loading = true;
    this.error = "";
    try {
      await work();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
