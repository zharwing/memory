import { makeAutoObservable, runInAction } from "mobx";
import type { ZharwingMemoryClient } from "@zharwing/memory-api-client";
import type { ContextBundle } from "@zharwing/memory-core";
import type { RootStore } from "./root-store.js";

export class AssistantStore {
  status: any = undefined;
  providerCheck: any = undefined;
  contextBundle: ContextBundle | undefined = undefined;
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

  resetProviderCheck() {
    this.providerCheck = undefined;
  }

  clear() {
    this.status = undefined;
    this.providerCheck = undefined;
  }

  async loadStatus() {
    if (!this.projectId) return;
    await this.run(async () => {
      const status = await this.client.call("memory.assistant_status", {
        projectId: this.projectId
      });
      runInAction(() => {
        this.status = status;
      });
    });
  }

  async loadContextBundle() {
    if (!this.projectId) return;
    await this.run(async () => {
      const contextBundle = await this.client.call<ContextBundle>("memory.preview_context_bundle", {
        projectId: this.projectId,
        requestedBy: "desktop"
      });
      runInAction(() => {
        this.contextBundle = contextBundle;
      });
    });
  }

  async updatePolicy(policy: Record<string, unknown>) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.update_assistant_policy", {
        projectId: this.projectId,
        policy
      });
      await this.root.projects.load();
      await this.root.projects.loadSummary();
      await this.loadStatus();
    });
  }

  async checkProvider(args: Record<string, unknown> = {}) {
    if (!this.projectId) return undefined;
    let result: any = undefined;
    await this.run(async () => {
      try {
        result = await this.client.call("memory.check_semantic_graph_provider", {
          projectId: this.projectId,
          ...args
        });
        runInAction(() => {
          this.providerCheck = result;
        });
      } catch (error) {
        result = {
          ok: false,
          endpoint: String(args.endpoint || ""),
          model: String(args.model || ""),
          latencyMs: 0,
          message: error instanceof Error ? error.message : String(error)
        };
        runInAction(() => {
          this.providerCheck = result;
        });
        throw error;
      }
    });
    return result;
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
