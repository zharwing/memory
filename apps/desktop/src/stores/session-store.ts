import { makeAutoObservable } from "mobx";
import type { MemoryClient } from "@zharwing/memory-api-client";
import type { SessionSummary } from "@zharwing/memory-core";
import {
  OperationLedger,
  type OperationAttempt,
  type OperationState
} from "../application/operations/operation-state.js";
import { executeConfirmedDestructiveOperation } from "../application/operations/destructive-operation.js";
import type {
  ScopedProjectPort,
  ScopeToken,
  SessionStoreCoordinator,
  StoreAsyncRuntimePort
} from "../application/operations/store-ports.js";
import {
  ResourceSlot,
  publicErrorCopy,
  type Completeness,
  type ResourceState
} from "../application/resources/resource-state.js";

/** Session list rows; the daemon returns summaries and the store lazily merges the Markdown body. */
export type SessionListItem = SessionSummary & { body?: string };

const SESSION_LIMITS = [20, 50, 100, 200] as const;
type SessionLimit = (typeof SESSION_LIMITS)[number];

export class SessionStore {
  readonly listResource: ResourceSlot<SessionListItem[]>;
  readonly detailBodiesResource: ResourceSlot<Record<string, string>>;
  readonly operations: OperationLedger;
  requestedLimit: SessionLimit = 20;

  constructor(
    private readonly client: MemoryClient,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: SessionStoreCoordinator,
    runtime: StoreAsyncRuntimePort
  ) {
    this.listResource = new ResourceSlot(scope, runtime);
    this.detailBodiesResource = new ResourceSlot(scope, runtime, () => false);
    this.operations = new OperationLedger(runtime);
    makeAutoObservable<this, "client" | "scope" | "coordinator">(this, {
      client: false,
      scope: false,
      coordinator: false,
      listResource: false,
      detailBodiesResource: false,
      operations: false
    });
  }

  get listState(): ResourceState<SessionListItem[]> {
    return this.listResource.state;
  }

  get list(): SessionListItem[] {
    const bodies = this.detailBodiesResource.data ?? {};
    return (this.listResource.data ?? []).map((session) =>
      Object.hasOwn(bodies, session.id) ? { ...session, body: bodies[session.id] } : session
    );
  }

  get listCompleteness(): Completeness | undefined {
    return this.listResource.completeness;
  }

  get canLoadMore(): boolean {
    return this.listCompleteness?.kind === "partial" && this.requestedLimit < 200;
  }

  get loading(): boolean {
    return this.listResource.loading || this.detailBodiesResource.loading || this.operations.isBusy();
  }

  get error(): string {
    return publicErrorCopy(
      this.listResource.error ?? this.detailBodiesResource.error ?? this.operations.error
    );
  }

  operationState(key: string): OperationState {
    return this.operations.state(key);
  }

  clear(): void {
    this.listResource.reset();
    this.detailBodiesResource.reset();
    this.operations.reset();
    this.requestedLimit = 20;
  }

  async load(
    limit: SessionLimit = this.requestedLimit,
    token = this.scope.captureScope()
  ): Promise<void> {
    const attempt = this.listResource.begin(token);
    if (!attempt) return;
    try {
      const sessions = await this.client.operation(
        "memory.list_project_sessions",
        { projectId: attempt.scope.projectId, limit },
        { signal: attempt.scope.signal }
      );
      const completeness: Completeness = sessions.length < limit
        ? { kind: "complete" }
        : { kind: "partial" };
      if (this.listResource.succeed(attempt, sessions, completeness)) this.requestedLimit = limit;
    } catch (error) {
      this.listResource.fail(attempt, error);
    }
  }

  async loadMore(): Promise<void> {
    if (!this.canLoadMore) return;
    const next = SESSION_LIMITS.find((limit) => limit > this.requestedLimit) ?? 200;
    await this.load(next);
  }

  /** Compatibility alias: the service caps this query at 200 and may still be partial. */
  async loadAll(): Promise<void> {
    await this.load(200);
  }

  async loadDetail(sessionId: string): Promise<void> {
    if (!sessionId) return;
    const attempt = this.detailBodiesResource.begin();
    if (!attempt) return;
    const bodies = this.detailBodiesResource.data ?? {};
    try {
      const detail = await this.client.operation(
        "memory.get_session_detail",
        {
          projectId: attempt.scope.projectId,
          sessionId,
          sections: ["body"]
        },
        { signal: attempt.scope.signal }
      );
      this.detailBodiesResource.succeed(
        attempt,
        { ...bodies, [sessionId]: detail.body ?? "" }
      );
    } catch (error) {
      this.detailBodiesResource.fail(attempt, error);
    }
  }

  async startSession(taskTitle = "", workstreamIds: string[] = []): Promise<void> {
    await this.mutate(
      "session:start",
      (token, operationId) => this.client.operation(
        "memory.start_session",
        {
          projectId: token.projectId,
          taskTitle: taskTitle.trim() || undefined,
          agent: "manual",
          client: "desktop",
          workingDirectory: this.scope.currentProjectWorkingDirectory(),
          workstreamIds
        },
        { signal: token.signal, idempotencyKey: operationId }
      ),
      (token) => Promise.all([this.load(this.requestedLimit, token), this.coordinator.refreshProjectSummary()])
    );
  }

  async closeSession(sessionId: string, summary = ""): Promise<void> {
    await this.mutate(
      `session:close:${sessionId}`,
      (token, operationId) => this.client.operation(
        "memory.close_session",
        {
          projectId: token.projectId,
          sessionId,
          summary: summary.trim() || undefined,
          autoSummarize: true
        },
        { signal: token.signal, idempotencyKey: operationId }
      ),
      (token) => Promise.all([this.load(this.requestedLimit, token), this.coordinator.refreshProjectSummary()])
    );
  }

  async closeStaleSessions(): Promise<void> {
    await this.mutate(
      "session:close-stale",
      (token, operationId) => this.client.operation(
        "memory.close_stale_sessions",
        { projectId: token.projectId },
        { signal: token.signal, idempotencyKey: operationId }
      ),
      (token) => Promise.all([this.load(this.requestedLimit, token), this.coordinator.refreshProjectSummary()])
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.mutate(
      `session:delete:${sessionId}`,
      (token, operationId) => executeConfirmedDestructiveOperation(
        this.client,
        token.projectId,
        "memory.delete_session",
        { projectId: token.projectId, sessionId },
        { signal: token.signal, idempotencyKey: operationId }
      ),
      (token) => Promise.all([
        this.load(this.requestedLimit, token),
        this.coordinator.refreshProjectSummary(),
        this.coordinator.refreshGraph(),
        this.coordinator.refreshTrash()
      ])
    );
  }

  async updateGraphVisibility(sessionId: string, includeInGraph: boolean): Promise<void> {
    await this.mutate(
      `session:visibility:${sessionId}`,
      (token, operationId) => this.client.operation(
        "memory.update_session_graph_visibility",
        { projectId: token.projectId, sessionId, includeInGraph },
        { signal: token.signal, idempotencyKey: operationId }
      ),
      (token) => Promise.all([this.load(this.requestedLimit, token), this.coordinator.refreshGraph()])
    );
  }

  async generateSummary(sessionId: string, force = true): Promise<void> {
    await this.mutate(
      `session:summary:${sessionId}`,
      (token, operationId) => this.client.operation(
        "memory.generate_session_summary",
        { projectId: token.projectId, sessionId, force },
        { signal: token.signal, idempotencyKey: operationId }
      ),
      (token) => Promise.all([this.load(this.requestedLimit, token), this.coordinator.refreshProjectSummary()])
    );
  }

  async generateSummaries(mode: "missing" | "all" = "missing"): Promise<void> {
    await this.mutate(
      `session:summaries:${mode}`,
      (token, operationId) => this.client.operation(
        "memory.generate_session_summaries",
        { projectId: token.projectId, mode },
        { signal: token.signal, idempotencyKey: operationId }
      ),
      (token) => Promise.all([this.load(this.requestedLimit, token), this.coordinator.refreshProjectSummary()])
    );
  }

  async saveCheckpoint(sessionId: string, summary: string): Promise<void> {
    await this.mutate(
      `session:checkpoint:${sessionId}`,
      (token, operationId) => this.client.operation(
        "memory.save_checkpoint",
        { projectId: token.projectId, sessionId, summary },
        { signal: token.signal, idempotencyKey: operationId }
      ),
      (token) => Promise.all([this.load(this.requestedLimit, token), this.coordinator.refreshProjectSummary()])
    );
  }

  private async mutate<Result>(
    key: string,
    work: (token: ScopeToken, operationId: string) => Promise<Result>,
    refresh: (token: ScopeToken) => Promise<unknown>
  ): Promise<Result | undefined> {
    const token = this.scope.captureScope();
    if (!token) return undefined;
    const attempt = this.operations.begin(key, token);
    try {
      const result = await work(token, attempt.operationId);
      if (!this.scope.isScopeCurrent(token) || !this.operations.succeed(attempt, result)) {
        this.operations.abandon(attempt);
        return undefined;
      }
      await refresh(token);
      return result;
    } catch (error) {
      this.settleFailure(attempt, token, error);
      return undefined;
    }
  }

  private settleFailure(attempt: OperationAttempt, token: ScopeToken, error: unknown): void {
    if (this.scope.isScopeCurrent(token)) this.operations.fail(attempt, error);
    else this.operations.abandon(attempt);
  }
}
