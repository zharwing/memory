import { makeAutoObservable } from "mobx";
import type { SessionsClientPort } from "../application/ports/features.js";
import type {
  OperationInput,
  OperationOutput,
  SessionSummary
} from "@zharwing/memory-core";
import {
  OperationLedger,
  type OperationState
} from "../application/operations/operation-state.js";
import { prepareDestructiveDispatch } from "../application/operations/destructive-operation.js";
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
import { resourceReadModel } from "../application/resources/resource-read-model.js";

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
    private readonly client: SessionsClientPort,
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

  get listRead() { return resourceReadModel(this.listResource); }
  get detailBodiesRead() { return resourceReadModel(this.detailBodiesResource); }

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
    await this.command(
      "session:start",
      "memory.start_session",
      (projectId) => ({
        projectId,
        taskTitle: taskTitle.trim() || undefined,
        agent: "manual",
        client: "desktop",
        workingDirectory: this.scope.currentProjectWorkingDirectory(),
        workstreamIds
      })
    );
  }

  async closeSession(
    sessionId: string,
    summary = "",
    includeInGraph?: boolean
  ): Promise<OperationOutput<"memory.close_session"> | undefined> {
    return this.command(
      `session:close:${sessionId}`,
      "memory.close_session",
      (projectId) => ({
        projectId,
        sessionId,
        summary: summary.trim() || undefined,
        includeInGraph,
        compact: true,
        autoSummarize: true
      })
    );
  }

  async closeStaleSessions(): Promise<void> {
    await this.command(
      "session:close-stale",
      "memory.close_stale_sessions",
      (projectId) => ({ projectId })
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.command(
      `session:delete:${sessionId}`,
      "memory.delete_session",
      (projectId) => ({ projectId, sessionId }),
      (input, operationId, signal) => prepareDestructiveDispatch(
        this.client,
        input.projectId,
        "memory.delete_session",
        input,
        { signal, idempotencyKey: operationId }
      )
    );
  }

  async updateGraphVisibility(
    sessionId: string,
    includeInGraph: boolean
  ): Promise<OperationOutput<"memory.update_session_graph_visibility"> | undefined> {
    return this.command(
      `session:visibility:${sessionId}`,
      "memory.update_session_graph_visibility",
      (projectId) => ({ projectId, sessionId, includeInGraph, compact: true })
    );
  }

  async generateSummary(sessionId: string, force = true): Promise<void> {
    await this.command(
      `session:summary:${sessionId}`,
      "memory.generate_session_summary",
      (projectId) => ({ projectId, sessionId, force })
    );
  }

  async generateSummaries(mode: "missing" | "all" = "missing"): Promise<void> {
    await this.command(
      `session:summaries:${mode}`,
      "memory.generate_session_summaries",
      (projectId) => ({ projectId, mode })
    );
  }

  async saveCheckpoint(sessionId: string, summary: string): Promise<void> {
    await this.command(
      `session:checkpoint:${sessionId}`,
      "memory.save_checkpoint",
      (projectId) => ({ projectId, sessionId, summary })
    );
  }

  private async command<Name extends SessionCommandName>(
    key: string,
    operation: Name,
    inputFor: (projectId: string) => OperationInput<Name>,
    prepareDispatch?: (
      input: OperationInput<Name>,
      operationId: string,
      signal: AbortSignal
    ) => Promise<{ execute(): Promise<OperationOutput<Name>> }>
  ): Promise<OperationOutput<Name> | undefined> {
    const token = this.scope.captureScope();
    if (!token) return undefined;
    const input = inputFor(token.projectId);
    return this.coordinator.executeCommand({
      port: this.client,
      operation,
      input,
      ledger: this.operations,
      key,
      scope: token,
      prepareDispatch: prepareDispatch
        ? (operationId) => prepareDispatch(input, operationId, token.signal)
        : undefined
    });
  }
}

type SessionCommandName =
  | "memory.start_session"
  | "memory.close_session"
  | "memory.close_stale_sessions"
  | "memory.delete_session"
  | "memory.update_session_graph_visibility"
  | "memory.generate_session_summary"
  | "memory.generate_session_summaries"
  | "memory.save_checkpoint";
