import { makeAutoObservable, runInAction } from "mobx";
import type { ZharwingMemoryClient } from "@zharwing/memory-api-client";
import type { MemoryDocument, SearchResult } from "@zharwing/memory-core";
import type { RootStore } from "./root-store.js";

export class DocsStore {
  list: MemoryDocument[] = [];
  searchResults: SearchResult[] = [];
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
  }

  async load() {
    if (!this.projectId) return;
    await this.run(async () => {
      const docs = await this.client.call<MemoryDocument[]>("memory.list_docs", {
        projectId: this.projectId
      });
      runInAction(() => {
        this.list = docs;
      });
    });
  }

  async updateDocument(documentId: string, args: { title?: string; body?: string }) {
    if (!this.projectId) return undefined;
    let updatedDocument: MemoryDocument | undefined = undefined;
    await this.run(async () => {
      updatedDocument = await this.client.call<MemoryDocument>("memory.update_doc", {
        projectId: this.projectId,
        documentId,
        title: args.title,
        body: args.body
      });
      await this.load();
      await this.root.graph.load();
    });
    return updatedDocument;
  }

  async deleteDocument(documentId: string) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.delete_doc", {
        projectId: this.projectId,
        documentId
      });
      await this.load();
      await this.root.projects.loadSummary();
      await this.root.graph.load();
      await this.root.system.loadTrash();
    });
  }

  async search(query: string) {
    if (!this.projectId || !query.trim()) {
      this.searchResults = [];
      return;
    }
    await this.run(async () => {
      const results = await this.client.call<SearchResult[]>("memory.search", {
        projectId: this.projectId,
        query
      });
      runInAction(() => {
        this.searchResults = results;
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
