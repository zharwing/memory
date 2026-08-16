import { makeAutoObservable } from "mobx";
import type { DocsClientPort } from "../application/ports/features.js";
import type { MemoryDocument, SearchResult } from "@zharwing/memory-core";
import { OperationLedger, type OperationState } from "../application/operations/operation-state.js";
import { prepareDestructiveDispatch } from "../application/operations/destructive-operation.js";
import type {
  DocsStoreCoordinator,
  ScopedProjectPort,
  ScopeToken,
  StoreAsyncRuntimePort
} from "../application/operations/store-ports.js";
import {
  ResourceSlot,
  publicErrorCopy,
  type ResourceState
} from "../application/resources/resource-state.js";
import { resourceReadModel } from "../application/resources/resource-read-model.js";

export class DocsStore {
  readonly listResource: ResourceSlot<MemoryDocument[]>;
  readonly searchResource: ResourceSlot<SearchResult[]>;
  readonly operations: OperationLedger;
  searchQuery = "";

  constructor(
    private readonly client: DocsClientPort,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: DocsStoreCoordinator,
    runtime: StoreAsyncRuntimePort
  ) {
    this.listResource = new ResourceSlot(scope, runtime);
    this.searchResource = new ResourceSlot(scope, runtime);
    this.operations = new OperationLedger(runtime);
    makeAutoObservable<this, "client" | "scope" | "coordinator">(this, {
      client: false,
      scope: false,
      coordinator: false,
      listResource: false,
      searchResource: false,
      operations: false
    });
  }

  get listState(): ResourceState<MemoryDocument[]> {
    return this.listResource.state;
  }

  get searchState(): ResourceState<SearchResult[]> {
    return this.searchResource.state;
  }

  get listRead() { return resourceReadModel(this.listResource); }
  get searchRead() { return resourceReadModel(this.searchResource); }

  get list(): MemoryDocument[] {
    return this.listResource.data ?? [];
  }

  get searchResults(): SearchResult[] {
    return this.searchResource.data ?? [];
  }

  get loading(): boolean {
    return this.listResource.loading || this.searchResource.loading || this.operations.isBusy();
  }

  get error(): string {
    return publicErrorCopy(
      this.listResource.error ?? this.searchResource.error ?? this.operations.error
    );
  }

  operationState(key: string): OperationState {
    return this.operations.state(key);
  }

  clear(): void {
    this.listResource.reset();
    this.searchResource.reset();
    this.operations.reset();
    this.searchQuery = "";
  }

  async load(token = this.scope.captureScope()): Promise<void> {
    const attempt = this.listResource.begin(token);
    if (!attempt) return;
    try {
      const docs = await this.client.operation(
        "memory.list_docs",
        { projectId: attempt.scope.projectId },
        { signal: attempt.scope.signal }
      );
      this.listResource.succeed(attempt, docs);
    } catch (error) {
      this.listResource.fail(attempt, error);
    }
  }

  async updateDocument(
    documentId: string,
    args: { title?: string; body?: string }
  ): Promise<MemoryDocument | undefined> {
    const token = this.scope.captureScope();
    if (!token) return undefined;
    return this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.update_doc",
      input: {
        projectId: token.projectId,
        documentId,
        title: args.title,
        body: args.body
      },
      ledger: this.operations,
      key: `document:update:${documentId}`,
      scope: token
    });
  }

  async deleteDocument(documentId: string): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const input = { projectId: token.projectId, documentId };
    await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.delete_doc",
      input,
      ledger: this.operations,
      key: `document:delete:${documentId}`,
      scope: token,
      prepareDispatch: (operationId) => prepareDestructiveDispatch(
        this.client,
        token.projectId,
        "memory.delete_doc",
        input,
        { signal: token.signal, idempotencyKey: operationId }
      )
    });
  }

  async search(query: string): Promise<void> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      this.searchQuery = "";
      this.searchResource.reset();
      return;
    }
    const token = this.scope.captureScope();
    const attempt = this.searchResource.begin(token);
    if (!attempt) return;
    this.searchQuery = normalizedQuery;
    try {
      const results = await this.client.operation(
        "memory.search",
        { projectId: attempt.scope.projectId, query: normalizedQuery },
        { signal: attempt.scope.signal }
      );
      this.searchResource.succeed(attempt, results);
    } catch (error) {
      this.searchResource.fail(attempt, error);
    }
  }

}
