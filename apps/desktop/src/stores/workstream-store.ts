import { makeAutoObservable, runInAction } from "mobx";
import type { ZharwingMemoryClient } from "@zharwing/memory-api-client";
import type { Workstream, WorkstreamDetail } from "@zharwing/memory-core";
import type { RootStore } from "./root-store.js";

export class WorkstreamStore {
  list: Workstream[] = [];
  selectedWorkstreamId = "";
  detail: WorkstreamDetail | undefined = undefined;
  private loadedProjectId = "";
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

  clear() {
    this.list = [];
    this.selectedWorkstreamId = "";
    this.detail = undefined;
    this.loadedProjectId = "";
  }

  async load() {
    const projectId = this.projectId;
    if (!projectId) {
      this.clear();
      return;
    }
    if (this.loadedProjectId !== projectId) {
      this.clear();
      this.loadedProjectId = projectId;
    }
    await this.run(async () => {
      const workstreams = await this.client.call<Workstream[]>("memory.list_workstreams", {
        projectId
      });
      if (this.projectId !== projectId) return;
      runInAction(() => {
        this.list = workstreams;
        if (!this.selectedWorkstreamId && this.list[0]) this.selectedWorkstreamId = this.list[0].id;
      });
    }, () => this.projectId === projectId);
  }

  async createWorkstream(args: {
    name: string;
    summary?: string;
    goal?: string;
    topics?: string[];
    repoRoles?: string[];
    relatedTasks?: string[];
    relatedFiles?: string[];
  }) {
    if (!this.projectId) return;
    await this.run(async () => {
      const workstream = await this.client.call<Workstream>("memory.create_workstream", {
        projectId: this.projectId,
        ...args
      });
      await this.load();
      runInAction(() => {
        this.selectedWorkstreamId = workstream.id;
      });
      await this.loadDetail(workstream.id);
    });
  }

  async selectWorkstream(workstreamId: string) {
    this.selectedWorkstreamId = workstreamId;
    await this.loadDetail(workstreamId);
  }

  async loadDetail(workstreamId = this.selectedWorkstreamId) {
    const projectId = this.projectId;
    if (!projectId || !workstreamId) return;
    await this.run(async () => {
      const detail = await this.client.call<WorkstreamDetail>("memory.get_workstream_detail", {
        projectId,
        workstreamId
      });
      if (this.projectId !== projectId) return;
      runInAction(() => {
        this.detail = detail;
      });
    }, () => this.projectId === projectId);
  }

  async updateStatus(workstreamId: string, status: string) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.update_workstream_status", {
        projectId: this.projectId,
        workstreamId,
        status
      });
      await this.load();
      await this.loadDetail(workstreamId);
    });
  }

  async deleteWorkstream(workstreamId: string) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.delete_workstream", {
        projectId: this.projectId,
        workstreamId
      });
      runInAction(() => {
        if (this.selectedWorkstreamId === workstreamId) {
          this.selectedWorkstreamId = "";
          this.detail = undefined;
        }
      });
      await this.load();
      await this.root.projects.loadSummary();
      await this.root.graph.load();
      await this.root.system.loadTrash();
    });
  }

  private async run(work: () => Promise<void>, shouldApply = () => true) {
    this.loading = true;
    this.error = "";
    try {
      await work();
    } catch (error) {
      if (!shouldApply()) return;
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
    } finally {
      if (!shouldApply()) return;
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
