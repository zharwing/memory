import { makeAutoObservable, runInAction } from "mobx";
import type { ZharwingMemoryClient } from "@zharwing/memory-api-client";
import type { ProposedMemoryUpdate } from "@zharwing/memory-core";
import type { RootStore } from "./root-store.js";

export class InboxStore {
  items: ProposedMemoryUpdate[] = [];
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

  async load() {
    if (!this.projectId) return;
    await this.run(async () => {
      const inbox = await this.client.call<ProposedMemoryUpdate[]>("memory.list_inbox", {
        projectId: this.projectId
      });
      runInAction(() => {
        this.items = inbox;
      });
    });
  }

  async deleteItem(proposalId: string) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.delete_inbox_item", {
        projectId: this.projectId,
        proposalId
      });
      await this.load();
      await this.root.projects.loadSummary();
      await this.root.system.loadTrash();
    });
  }

  async updateStatus(proposalId: string, status: string, editedPatch?: string) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.update_inbox_status", {
        projectId: this.projectId,
        proposalId,
        status,
        editedPatch
      });
      // Accepted proposals can patch docs and graph rules, so refresh those too.
      await this.load();
      await this.root.projects.loadSummary();
      await this.root.docs.load();
      await this.root.graph.load();
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
