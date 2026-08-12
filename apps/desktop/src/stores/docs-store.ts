import { makeAutoObservable } from "mobx";
import type { MemoryClient } from "@zharwing/memory-api-client";
import type { MemoryDocument, SearchResult } from "@zharwing/memory-core";
import { OperationLedger, type OperationState } from "../application/operations/operation-state.js";
import { executeConfirmedDestructiveOperation } from "../application/operations/destructive-operation.js";
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

export class DocsStore {
  readonly listResource: ResourceSlot<MemoryDocument[]>;
  readonly searchResource: ResourceSlot<SearchResult[]>;
  readonly operations: OperationLedger;
  searchQuery = "";

  constructor(
    private readonly client: MemoryClient,
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
    const attempt = this.operations.begin(`document:update:${documentId}`, token);
    try {
      const updated = await this.client.operation(
        "memory.update_doc",
        {
          projectId: token.projectId,
          documentId,
          title: args.title,
          body: args.body
        },
        {
          signal: token.signal,
          idempotencyKey: attempt.operationId
        }
      );
      if (!this.scope.isScopeCurrent(token) || !this.operations.succeed(attempt, updated)) {
        this.operations.abandon(attempt);
        return undefined;
      }
      await Promise.all([this.load(token), this.coordinator.refreshGraph()]);
      return updated;
    } catch (error) {
      this.settleFailure(attempt, token, error);
      return undefined;
    }
  }

  async deleteDocument(documentId: string): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const attempt = this.operations.begin(`document:delete:${documentId}`, token);
    try {
      const result = await executeConfirmedDestructiveOperation(
        this.client,
        token.projectId,
        "memory.delete_doc",
        { projectId: token.projectId, documentId },
        {
          signal: token.signal,
          idempotencyKey: attempt.operationId
        }
      );
      if (!this.scope.isScopeCurrent(token) || !this.operations.succeed(attempt, result)) {
        this.operations.abandon(attempt);
        return;
      }
      await Promise.all([
        this.load(token),
        this.coordinator.refreshProjectSummary(),
        this.coordinator.refreshGraph(),
        this.coordinator.refreshTrash()
      ]);
    } catch (error) {
      this.settleFailure(attempt, token, error);
    }
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

  private settleFailure(
    attempt: Parameters<OperationLedger["fail"]>[0],
    token: ScopeToken,
    error: unknown
  ): void {
    if (this.scope.isScopeCurrent(token)) this.operations.fail(attempt, error);
    else this.operations.abandon(attempt);
  }
}
