import { makeAutoObservable, runInAction } from "mobx";
import type { MemoryClient } from "@zharwing/memory-api-client";
import { parseOperationInput } from "@zharwing/memory-core";
import type {
  OperationInput,
  OperationOutput,
  SemanticGraphEdge,
  SemanticGraphEdgeStatus,
  SemanticGraphMode,
  SemanticGraphRun,
  SemanticGraphScope,
  SemanticGraphSettings
} from "@zharwing/memory-core";
import { OperationLedger, type OperationAttempt } from "../application/operations/operation-state.js";
import type {
  ScopeToken,
  ScopedProjectPort,
  SemanticStoreCoordinator,
  StoreAsyncRuntimePort,
  StoreSchedulerPort
} from "../application/operations/store-ports.js";
import {
  ResourceSlot,
  publicErrorCopy,
  toPublicError,
  type ResourceState
} from "../application/resources/resource-state.js";
import { graphRelationshipParams } from "./graph-store.js";

const POLL_BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 30_000] as const;
const POLL_SUCCESS_DELAY_MS = 2_000;

const OP_UPDATE_SETTINGS = "semantic:update-settings";
const OP_PREVIEW = "semantic:preview-analysis";
const OP_ANALYZE = "semantic:analyze";

type SemanticStatus = OperationOutput<"memory.get_semantic_graph_status">;
type SemanticPreview = OperationOutput<"memory.preview_semantic_graph_analysis">;
type SemanticAnalysisResult = OperationOutput<"memory.analyze_semantic_graph">;

type PollResult = "active" | "terminal" | "failure" | "superseded";

interface PollFlight {
  readonly scope: ScopeToken;
  readonly epoch: number;
  readonly promise: Promise<PollResult>;
}

interface ReconciliationFlight {
  readonly scope: ScopeToken;
  readonly promise: Promise<void>;
}

export class SemanticStore {
  readonly settingsResource: ResourceSlot<SemanticGraphSettings>;
  readonly statusResource: ResourceSlot<SemanticStatus>;
  readonly edgesResource: ResourceSlot<SemanticGraphEdge[]>;
  readonly runsResource: ResourceSlot<SemanticGraphRun[]>;
  readonly operations: OperationLedger;

  private _analysisProgressRun: SemanticGraphRun | undefined = undefined;
  private foreground = true;
  private pollingDesired = false;
  private pollingScope: ScopeToken | undefined = undefined;
  private pollFailures = 0;
  private pollEpoch = 0;
  private pollInFlight: PollFlight | undefined = undefined;
  private reconciliationInFlight: ReconciliationFlight | undefined = undefined;
  private analysisReconciliationAttempt: OperationAttempt | undefined = undefined;
  private progressRequestId: string | undefined = undefined;
  private readonly unsubscribeScope: () => void;
  private disposed = false;

  /** Compatibility handle retained for lifecycle tests; it is now a timeout. */
  pollHandle: ReturnType<typeof setTimeout> | undefined = undefined;

  constructor(
    private readonly client: MemoryClient,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: SemanticStoreCoordinator,
    private readonly scheduler: StoreSchedulerPort,
    private readonly runtime: StoreAsyncRuntimePort
  ) {
    this.settingsResource = new ResourceSlot(this.scope, this.runtime);
    this.statusResource = new ResourceSlot(this.scope, this.runtime);
    this.edgesResource = new ResourceSlot(this.scope, this.runtime);
    this.runsResource = new ResourceSlot(this.scope, this.runtime);
    this.operations = new OperationLedger(this.runtime);
    this.unsubscribeScope = this.scope.onScopeReset(() => this.clear());

    makeAutoObservable<
      this,
      | "client"
      | "scope"
      | "coordinator"
      | "scheduler"
      | "runtime"
      | "pollingDesired"
      | "pollingScope"
      | "pollFailures"
      | "pollEpoch"
      | "pollInFlight"
      | "reconciliationInFlight"
      | "analysisReconciliationAttempt"
      | "progressRequestId"
      | "unsubscribeScope"
      | "disposed"
    >(this, {
      client: false,
      scope: false,
      coordinator: false,
      scheduler: false,
      runtime: false,
      settingsResource: false,
      statusResource: false,
      edgesResource: false,
      runsResource: false,
      operations: false,
      pollingDesired: false,
      pollingScope: false,
      pollFailures: false,
      pollEpoch: false,
      pollInFlight: false,
      reconciliationInFlight: false,
      analysisReconciliationAttempt: false,
      progressRequestId: false,
      unsubscribeScope: false,
      disposed: false,
      pollHandle: false
    });
  }

  get settings(): SemanticGraphSettings | undefined {
    return this.settingsResource.data;
  }

  get settingsState(): ResourceState<SemanticGraphSettings> {
    return this.settingsResource.state;
  }

  get status(): SemanticStatus | undefined {
    return this.statusResource.data;
  }

  get statusState(): ResourceState<SemanticStatus> {
    return this.statusResource.state;
  }

  get edges(): SemanticGraphEdge[] {
    return this.edgesResource.data ?? [];
  }

  get edgesState(): ResourceState<SemanticGraphEdge[]> {
    return this.edgesResource.state;
  }

  get runs(): SemanticGraphRun[] {
    return this.runsResource.data ?? [];
  }

  get runsState(): ResourceState<SemanticGraphRun[]> {
    return this.runsResource.state;
  }

  get analysisPreview(): SemanticPreview | undefined {
    return operationResult<SemanticPreview>(this.operations, OP_PREVIEW);
  }

  get analysisResult(): SemanticAnalysisResult | undefined {
    return operationResult<SemanticAnalysisResult>(this.operations, OP_ANALYZE);
  }

  get analysisProgressRun(): SemanticGraphRun | undefined {
    return this._analysisProgressRun;
  }

  get analysisRunning(): boolean {
    const state = this.operations.state(OP_ANALYZE);
    return this.operations.isBusy(OP_ANALYZE) ||
      state.status === "reconciling" ||
      isSemanticAnalysisRunActive(this._analysisProgressRun);
  }

  get loading(): boolean {
    return this.operations.isBusy() ||
      this.settingsResource.loading ||
      this.statusResource.loading ||
      this.edgesResource.loading ||
      this.runsResource.loading;
  }

  get error(): string {
    return publicErrorCopy(
      this.operations.error ??
      this.settingsResource.error ??
      this.statusResource.error ??
      this.edgesResource.error ??
      this.runsResource.error
    );
  }

  get edgeCounts() {
    return this.status?.edgeCounts || {
      proposed: 0,
      accepted: 0,
      rejected: 0,
      "auto-accepted": 0
    };
  }

  /** Compatibility alias while all callers move fully to scope-reset listeners. */
  resetForProjectSwitch(): void {
    this.clear();
  }

  /** Synchronously removes every value owned by the previous project scope. */
  clear(): void {
    this.settingsResource.reset();
    this.statusResource.reset();
    this.edgesResource.reset();
    this.runsResource.reset();
    this.operations.reset();
    this._analysisProgressRun = undefined;
    this.analysisReconciliationAttempt = undefined;
    this.progressRequestId = undefined;
    // The old request is already aborted by the scope coordinator. Detaching
    // its identity lets the new generation poll without waiting for a carrier
    // that is slow to observe cancellation; the old callback still fails all
    // scope/epoch guards and cannot clear or reschedule the new flight.
    this.pollInFlight = undefined;
    this.reconciliationInFlight = undefined;
    this.pollFailures = 0;
    this.stopPolling();
  }

  setForeground(foreground: boolean): void {
    if (this.disposed || this.foreground === foreground) return;
    this.foreground = foreground;
    if (!foreground) {
      this.cancelScheduledPoll();
      return;
    }

    const scope = this.scope.captureScope();
    if (
      scope &&
      this.scope.isScopeCurrent(scope) &&
      (this.pollingDesired || isSemanticAnalysisRunActive(this._analysisProgressRun))
    ) {
      this.pollingDesired = true;
      this.pollingScope = scope;
      this.schedulePoll(0, true);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeScope();
    this.clear();
  }

  /** Settings and status only; the lighter refresh used on project switch. */
  async refreshStatus(scope = this.scope.captureScope()): Promise<void> {
    if (!scope || !this.scope.isScopeCurrent(scope)) return;

    const settingsAttempt = this.settingsResource.begin(scope);
    const statusAttempt = this.statusResource.begin(scope);
    if (!settingsAttempt || !statusAttempt) return;
    this.progressRequestId = statusAttempt.requestId;

    try {
      const [settings, status] = await Promise.all([
        this.client.operation(
          "memory.get_semantic_graph_settings",
          { projectId: scope.projectId },
          { signal: scope.signal }
        ),
        this.client.operation(
          "memory.get_semantic_graph_status",
          { projectId: scope.projectId },
          { signal: scope.signal }
        )
      ]);
      if (!this.canUse(scope)) return;

      runInAction(() => {
        this.settingsResource.succeed(settingsAttempt, settings);
        const accepted = this.statusResource.succeed(statusAttempt, status);
        if (accepted) {
          this.acceptLatestRun(
            statusAttempt.requestId,
            status.runCounts.latest || this._analysisProgressRun
          );
        }
      });
      this.syncPolling(scope);
    } catch (error) {
      runInAction(() => {
        this.settingsResource.fail(settingsAttempt, error);
        this.statusResource.fail(statusAttempt, error);
      });
    }
  }

  async load(scope = this.scope.captureScope()): Promise<void> {
    if (!scope || !this.scope.isScopeCurrent(scope)) return;
    await this.loadForScope(scope);
  }

  async updateSettings(settings: Record<string, unknown>): Promise<void> {
    const scope = this.scope.captureScope();
    if (!scope || !this.scope.isScopeCurrent(scope)) return;

    const operation = this.operations.begin(OP_UPDATE_SETTINGS, scope);
    const settingsAttempt = this.settingsResource.begin(scope);
    const statusAttempt = this.statusResource.begin(scope);
    if (!settingsAttempt || !statusAttempt) {
      this.operations.abandon(operation);
      return;
    }
    this.progressRequestId = statusAttempt.requestId;

    try {
      const next = await this.client.operation(
        "memory.update_semantic_graph_settings",
        { projectId: scope.projectId, settings },
        { signal: scope.signal }
      );
      if (!this.canUse(scope)) {
        this.operations.abandon(operation);
        return;
      }
      runInAction(() => {
        this.settingsResource.succeed(settingsAttempt, next);
        this.operations.succeed(operation, next);
      });

      try {
        const status = await this.client.operation(
          "memory.get_semantic_graph_status",
          { projectId: scope.projectId },
          { signal: scope.signal }
        );
        if (!this.canUse(scope)) return;
        runInAction(() => {
          const accepted = this.statusResource.succeed(statusAttempt, status);
          if (accepted) this.acceptLatestRun(
            statusAttempt.requestId,
            status.runCounts.latest || this._analysisProgressRun
          );
        });
        this.syncPolling(scope);
      } catch (error) {
        runInAction(() => this.statusResource.fail(statusAttempt, error));
      }
    } catch (error) {
      runInAction(() => {
        this.settingsResource.cancel(settingsAttempt);
        this.statusResource.cancel(statusAttempt);
        this.operations.fail(operation, error);
      });
    }
  }

  async previewAnalysis(
    analysisScope: SemanticGraphScope | { kind: string; nodeId?: string } = { kind: "all-docs" }
  ): Promise<SemanticPreview | undefined> {
    const scope = this.scope.captureScope();
    if (!scope || !this.scope.isScopeCurrent(scope)) return undefined;

    // Decode caller input before creating any observable pending state. A
    // local validation failure therefore cannot leave a phantom operation or
    // refreshing resource behind.
    const input = parseOperationInput("memory.preview_semantic_graph_analysis", {
      projectId: scope.projectId,
      scope: analysisScope,
      persistCandidateIndex: true
    });

    const operation = this.operations.begin(OP_PREVIEW, scope);
    const statusAttempt = this.statusResource.begin(scope);
    if (!statusAttempt) {
      this.operations.abandon(operation);
      return undefined;
    }
    this.progressRequestId = statusAttempt.requestId;

    try {
      const preview = await this.client.operation(
        "memory.preview_semantic_graph_analysis",
        input,
        { signal: scope.signal }
      );
      const status = await this.client.operation(
        "memory.get_semantic_graph_status",
        { projectId: scope.projectId },
        { signal: scope.signal }
      );
      if (!this.canUse(scope)) {
        this.operations.abandon(operation);
        return undefined;
      }

      let accepted = false;
      runInAction(() => {
        const statusAccepted = this.statusResource.succeed(statusAttempt, status);
        accepted = this.operations.succeed(operation, preview);
        if (statusAccepted) {
          this.acceptLatestRun(
            statusAttempt.requestId,
            status.runCounts.latest || this._analysisProgressRun
          );
        }
      });
      return accepted ? preview : undefined;
    } catch (error) {
      runInAction(() => {
        this.statusResource.cancel(statusAttempt);
        this.operations.fail(operation, error);
      });
      return undefined;
    }
  }

  async analyze(args: Omit<OperationInput<"memory.analyze_semantic_graph">, "projectId">): Promise<void> {
    const scope = this.scope.captureScope();
    if (!scope || !this.scope.isScopeCurrent(scope)) return;

    const input = parseOperationInput("memory.analyze_semantic_graph", {
      ...args,
      // The captured authority is final even if an untyped caller smuggles a
      // projectId through the nominal Omit type.
      projectId: scope.projectId
    });
    const operation = this.operations.begin(OP_ANALYZE, scope);

    runInAction(() => {
      this.progressRequestId = operation.operationId;
      this._analysisProgressRun = createPendingSemanticAnalysisRun(
        input,
        this.settings?.mode,
        this.runtime.now()
      );
    });
    this.startPolling(scope);

    let result: SemanticAnalysisResult;
    try {
      result = await this.client.operation(
        "memory.analyze_semantic_graph",
        input,
        { signal: scope.signal }
      );
    } catch (error) {
      if (!this.canUse(scope)) {
        this.operations.abandon(operation);
        return;
      }

      const publicError = toPublicError(error);
      runInAction(() => {
        if (publicError.retry === "after-reconcile") {
          this.operations.reconcile(operation);
          this.analysisReconciliationAttempt = operation;
        } else {
          this.operations.fail(operation, error);
          this.progressRequestId = operation.operationId;
          this._analysisProgressRun = undefined;
        }
      });
      if (publicError.retry === "after-reconcile") this.startPolling(scope);
      else this.stopPolling();
      return;
    }

    if (!this.canUse(scope)) {
      this.operations.abandon(operation);
      return;
    }
    runInAction(() => {
      this.progressRequestId = operation.operationId;
      this.operations.succeed(operation, result);
      this.analysisReconciliationAttempt = undefined;
      this._analysisProgressRun = result.run || this._analysisProgressRun;
    });

    let reconciled = false;
    try {
      await this.reconcileAuthoritative(scope);
      reconciled = true;
    } catch {
      // Resource slots own the reconciliation failure. Polling retries it with
      // bounded backoff without changing the accepted operation result.
    }

    if (!this.canUse(scope)) return;
    if (!reconciled || isSemanticAnalysisRunActive(this._analysisProgressRun)) this.startPolling(scope);
    else this.stopPolling();
  }

  async acceptEdgesProposal(
    proposalId: string,
    options: Omit<
      OperationInput<"memory.accept_semantic_edges_proposal">,
      "projectId" | "proposalId"
    > = {}
  ): Promise<void> {
    const scope = this.scope.captureScope();
    if (!scope || !this.scope.isScopeCurrent(scope)) return;

    // Parse before publishing a submitting state and put captured identifiers
    // last so a cast/untyped caller cannot redirect the mutation.
    const input = parseOperationInput("memory.accept_semantic_edges_proposal", {
      ...options,
      projectId: scope.projectId,
      proposalId
    });
    const operation = this.operations.begin(`semantic:accept-proposal:${proposalId}`, scope);

    try {
      const result = await this.client.operation(
        "memory.accept_semantic_edges_proposal",
        input,
        { signal: scope.signal }
      );
      if (!this.canUse(scope)) {
        this.operations.abandon(operation);
        return;
      }
      runInAction(() => {
        this.operations.succeed(operation, result);
      });

      if (!this.canUse(scope)) return;
      await this.coordinator.refreshInbox();
      if (!this.canUse(scope)) return;
      await this.coordinator.refreshProjectSummary();
      if (!this.canUse(scope)) return;
      await this.coordinator.refreshGraph();
      if (!this.canUse(scope)) return;
      await this.loadForScope(scope);
    } catch (error) {
      runInAction(() => {
        this.operations.fail(operation, error);
      });
    }
  }

  async updateEdgeStatus(edgeIds: string[], status: SemanticGraphEdgeStatus): Promise<void> {
    const scope = this.scope.captureScope();
    if (!scope || !this.scope.isScopeCurrent(scope) || edgeIds.length === 0) return;

    const operation = this.operations.begin("semantic:update-edge-status", scope);
    const statusAttempt = this.statusResource.begin(scope);
    const edgesAttempt = this.edgesResource.begin(scope);
    if (!statusAttempt || !edgesAttempt) {
      this.operations.abandon(operation);
      return;
    }
    this.progressRequestId = statusAttempt.requestId;

    try {
      const result = await this.client.operation(
        "memory.update_semantic_edge_status",
        { projectId: scope.projectId, edgeIds, status },
        { signal: scope.signal }
      );
      if (!this.canUse(scope)) {
        this.operations.abandon(operation);
        return;
      }
      runInAction(() => this.operations.succeed(operation, result));

      try {
      const [nextStatus, edges] = await Promise.all([
        this.client.operation(
          "memory.get_semantic_graph_status",
          { projectId: scope.projectId },
          { signal: scope.signal }
        ),
        this.client.operation(
          "memory.list_semantic_edges",
          { projectId: scope.projectId },
          { signal: scope.signal }
        )
      ]);
      if (!this.canUse(scope)) {
        return;
      }

      runInAction(() => {
        const accepted = this.statusResource.succeed(statusAttempt, nextStatus);
        this.edgesResource.succeed(edgesAttempt, edges);
        if (accepted) {
          this.acceptLatestRun(
            statusAttempt.requestId,
            nextStatus.runCounts.latest || this._analysisProgressRun
          );
        }
      });
      if (this.canUse(scope)) await this.coordinator.refreshGraph();
      } catch (error) {
        runInAction(() => {
          this.statusResource.fail(statusAttempt, error);
          this.edgesResource.fail(edgesAttempt, error);
        });
      }
    } catch (error) {
      runInAction(() => {
        this.statusResource.cancel(statusAttempt);
        this.edgesResource.cancel(edgesAttempt);
        this.operations.fail(operation, error);
      });
    }
  }

  private async loadForScope(scope: ScopeToken): Promise<void> {
    if (!this.canUse(scope)) return;
    const settingsAttempt = this.settingsResource.begin(scope);
    const statusAttempt = this.statusResource.begin(scope);
    const edgesAttempt = this.edgesResource.begin(scope);
    const runsAttempt = this.runsResource.begin(scope);
    if (!settingsAttempt || !statusAttempt || !edgesAttempt || !runsAttempt) return;
    this.progressRequestId = runsAttempt.requestId;

    try {
      const [settings, status, edges, runs] = await Promise.all([
        this.client.operation(
          "memory.get_semantic_graph_settings",
          { projectId: scope.projectId },
          { signal: scope.signal }
        ),
        this.client.operation(
          "memory.get_semantic_graph_status",
          { projectId: scope.projectId },
          { signal: scope.signal }
        ),
        this.client.operation(
          "memory.list_semantic_edges",
          { projectId: scope.projectId },
          { signal: scope.signal }
        ),
        this.client.operation(
          "memory.list_semantic_graph_runs",
          { projectId: scope.projectId },
          { signal: scope.signal }
        )
      ]);
      if (!this.canUse(scope)) return;

      runInAction(() => {
        this.settingsResource.succeed(settingsAttempt, settings);
        this.statusResource.succeed(statusAttempt, status);
        this.edgesResource.succeed(edgesAttempt, edges);
        const accepted = this.runsResource.succeed(runsAttempt, runs);
        if (accepted) {
          this.acceptLatestRun(
            runsAttempt.requestId,
            runs[0] || status.runCounts.latest || this._analysisProgressRun
          );
        }
      });
      this.syncPolling(scope);
    } catch (error) {
      runInAction(() => {
        this.settingsResource.fail(settingsAttempt, error);
        this.statusResource.fail(statusAttempt, error);
        this.edgesResource.fail(edgesAttempt, error);
        this.runsResource.fail(runsAttempt, error);
      });
    }
  }

  private startPolling(scope: ScopeToken): void {
    if (!this.canUse(scope)) return;
    if (this.pollingScope !== scope) {
      this.cancelScheduledPoll();
      this.pollingScope = scope;
      this.pollFailures = 0;
      this.pollEpoch += 1;
    }
    this.pollingDesired = true;
    this.schedulePoll(0, true);
  }

  private stopPolling(): void {
    this.pollingDesired = false;
    this.pollingScope = undefined;
    this.pollFailures = 0;
    this.pollEpoch += 1;
    this.cancelScheduledPoll();
  }

  private cancelScheduledPoll(): void {
    if (this.pollHandle === undefined) return;
    this.scheduler.clearTimeout(this.pollHandle);
    this.pollHandle = undefined;
  }

  private schedulePoll(delayMs: number, replace = false): void {
    const scope = this.pollingScope;
    if (!scope || !this.shouldPoll(scope, this.pollEpoch) || this.pollInFlight) return;
    if (this.pollHandle !== undefined) {
      if (!replace) return;
      this.cancelScheduledPoll();
    }

    const epoch = this.pollEpoch;
    this.pollHandle = this.scheduler.setTimeout(() => {
      this.pollHandle = undefined;
      void this.pollOnce(scope, epoch);
    }, delayMs);
  }

  private async pollOnce(scope: ScopeToken, epoch: number): Promise<void> {
    if (!this.shouldPoll(scope, epoch) || this.pollInFlight) return;

    const flight: PollFlight = {
      scope,
      epoch,
      promise: this.performPoll(scope)
    };
    this.pollInFlight = flight;
    const result = await flight.promise;

    if (this.pollInFlight === flight) this.pollInFlight = undefined;
    if (!this.shouldPoll(scope, epoch)) return;

    if (result === "active") {
      this.pollFailures = 0;
      this.schedulePoll(POLL_SUCCESS_DELAY_MS);
      return;
    }
    if (result === "superseded") {
      this.schedulePoll(POLL_SUCCESS_DELAY_MS);
      return;
    }
    if (result === "failure") {
      this.pollFailures += 1;
      const delay = POLL_BACKOFF_MS[Math.min(this.pollFailures - 1, POLL_BACKOFF_MS.length - 1)];
      this.schedulePoll(delay);
    }
  }

  private async performPoll(scope: ScopeToken): Promise<PollResult> {
    const statusAttempt = this.statusResource.begin(scope);
    const runsAttempt = this.runsResource.begin(scope);
    if (!statusAttempt || !runsAttempt) return "failure";
    this.progressRequestId = runsAttempt.requestId;

    try {
      const [status, runs] = await Promise.all([
        this.client.operation(
          "memory.get_semantic_graph_status",
          { projectId: scope.projectId },
          { signal: scope.signal }
        ),
        this.client.operation(
          "memory.list_semantic_graph_runs",
          { projectId: scope.projectId },
          { signal: scope.signal }
        )
      ]);
      if (!this.canUse(scope)) return "failure";

      const latestRun = runs[0] || status.runCounts.latest;
      let active = false;
      let accepted = false;
      runInAction(() => {
        const statusAccepted = this.statusResource.succeed(statusAttempt, status);
        const runsAccepted = this.runsResource.succeed(runsAttempt, runs);
        accepted = statusAccepted && runsAccepted && this.progressRequestId === runsAttempt.requestId;
        if (!accepted) return;
        this.acceptLatestRun(runsAttempt.requestId, latestRun);
        active = this.operations.isBusy(OP_ANALYZE) ||
          this.operations.state(OP_ANALYZE).status === "reconciling" ||
          isSemanticAnalysisRunActive(this._analysisProgressRun);
      });
      if (!accepted) return "superseded";
      if (active) return "active";

      await this.reconcileAuthoritative(scope);
      if (!this.canUse(scope)) return "failure";
      if (isSemanticAnalysisRunActive(this._analysisProgressRun)) return "active";
      runInAction(() => {
        if (this.analysisReconciliationAttempt) {
          this.operations.abandon(this.analysisReconciliationAttempt);
          this.analysisReconciliationAttempt = undefined;
        }
      });
      this.stopPolling();
      return "terminal";
    } catch (error) {
      runInAction(() => {
        this.statusResource.fail(statusAttempt, error);
        this.runsResource.fail(runsAttempt, error);
      });
      return "failure";
    }
  }

  private syncPolling(scope = this.scope.captureScope()): void {
    if (!scope || !this.canUse(scope)) {
      this.stopPolling();
      return;
    }
    const analyzeState = this.operations.state(OP_ANALYZE);
    if (
      !isSemanticAnalysisRunActive(this._analysisProgressRun) &&
      !this.operations.isBusy(OP_ANALYZE) &&
      analyzeState.status !== "reconciling"
    ) {
      this.stopPolling();
      return;
    }
    this.startPolling(scope);
  }

  private reconcileAuthoritative(scope: ScopeToken): Promise<void> {
    if (!this.canUse(scope)) return Promise.resolve();
    if (this.reconciliationInFlight?.scope === scope) return this.reconciliationInFlight.promise;

    const flight: ReconciliationFlight = {
      scope,
      promise: this.performAuthoritativeReconciliation(scope)
    };
    this.reconciliationInFlight = flight;
    void flight.promise.then(
      () => {
        if (this.reconciliationInFlight === flight) this.reconciliationInFlight = undefined;
      },
      () => {
        if (this.reconciliationInFlight === flight) this.reconciliationInFlight = undefined;
      }
    );
    return flight.promise;
  }

  private async performAuthoritativeReconciliation(scope: ScopeToken): Promise<void> {
    const statusAttempt = this.statusResource.begin(scope);
    const edgesAttempt = this.edgesResource.begin(scope);
    const runsAttempt = this.runsResource.begin(scope);
    if (!statusAttempt || !edgesAttempt || !runsAttempt) return;
    this.progressRequestId = runsAttempt.requestId;

    try {
      const [status, edges, runs, inbox, graph] = await Promise.all([
        this.client.operation(
          "memory.get_semantic_graph_status",
          { projectId: scope.projectId },
          { signal: scope.signal }
        ),
        this.client.operation(
          "memory.list_semantic_edges",
          { projectId: scope.projectId },
          { signal: scope.signal }
        ),
        this.client.operation(
          "memory.list_semantic_graph_runs",
          { projectId: scope.projectId },
          { signal: scope.signal }
        ),
        this.client.operation(
          "memory.list_inbox",
          { projectId: scope.projectId },
          { signal: scope.signal }
        ),
        this.client.operation(
          "memory.get_graph",
          {
            ...graphRelationshipParams(this.coordinator.graphRelationshipMode()),
            projectId: scope.projectId
          },
          { signal: scope.signal }
        )
      ]);
      if (!this.canUse(scope)) return;

      let accepted = false;
      runInAction(() => {
        const statusAccepted = this.statusResource.succeed(statusAttempt, status);
        const edgesAccepted = this.edgesResource.succeed(edgesAttempt, edges);
        const runsAccepted = this.runsResource.succeed(runsAttempt, runs);
        accepted = statusAccepted &&
          edgesAccepted &&
          runsAccepted &&
          this.progressRequestId === runsAttempt.requestId;
        if (accepted) {
          this.acceptLatestRun(
            runsAttempt.requestId,
            runs[0] || status.runCounts.latest || this._analysisProgressRun
          );
        }
        if (!accepted || !this.canUse(scope)) return;
        this.coordinator.replaceInboxItems(inbox);
        this.coordinator.replaceGraph(graph);
      });
    } catch (error) {
      runInAction(() => {
        this.statusResource.fail(statusAttempt, error);
        this.edgesResource.fail(edgesAttempt, error);
        this.runsResource.fail(runsAttempt, error);
      });
      throw error;
    }
  }

  private acceptLatestRun(requestId: string, run: SemanticGraphRun | undefined): void {
    if (this.progressRequestId !== requestId) return;
    const analyzeState = this.operations.state(OP_ANALYZE);
    const analyzePending = this.operations.isBusy(OP_ANALYZE) ||
      analyzeState.status === "reconciling";
    if (
      shouldKeepPendingSemanticAnalysisRun(
        this._analysisProgressRun,
        run,
        analyzePending
      )
    ) return;
    this._analysisProgressRun = run;
  }

  private canUse(scope: ScopeToken): boolean {
    return !this.disposed && this.scope.isScopeCurrent(scope);
  }

  private shouldPoll(scope: ScopeToken, epoch: number): boolean {
    return this.foreground &&
      this.pollingDesired &&
      this.pollingScope === scope &&
      this.pollEpoch === epoch &&
      this.canUse(scope);
  }
}

function operationResult<Result>(operations: OperationLedger, key: string): Result | undefined {
  const state = operations.state(key);
  return state.status === "succeeded" ? state.result as Result : undefined;
}

function isSemanticAnalysisRunActive(run: SemanticGraphRun | undefined): boolean {
  const status = String(run?.status || "");
  return status === "running" || status === "pending";
}

function createPendingSemanticAnalysisRun(
  input: OperationInput<"memory.analyze_semantic_graph">,
  configuredMode: SemanticGraphMode | undefined,
  started: string
): SemanticGraphRun {
  return {
    id: "pending-ui-run",
    projectId: input.projectId,
    status: "pending",
    mode: input.mode ?? (input.dryRun ? "dry-run" : configuredMode ?? "review"),
    scope: input.scope ?? { kind: "all-docs" },
    started,
    thresholds: {
      autoAccept: 0,
      review: 0,
      discardBelow: 0
    },
    counts: {
      documentsTotal: 0,
      documentsAnalyzed: 0,
      extractionsReused: 0,
      candidates: 0,
      judged: 0,
      accepted: 0,
      proposed: 0,
      rejected: 0,
      discarded: 0
    }
  };
}

function shouldKeepPendingSemanticAnalysisRun(
  currentRun: SemanticGraphRun | undefined,
  latestRun: SemanticGraphRun | undefined,
  currentlyRunning: boolean
): boolean {
  if (currentRun && latestRun && currentRun.id !== latestRun.id) {
    const currentTime = Math.max(timestampMs(currentRun.finished), timestampMs(currentRun.started));
    const latestTime = Math.max(timestampMs(latestRun.finished), timestampMs(latestRun.started));
    if (latestTime < currentTime) return true;
  }
  if (!currentlyRunning || currentRun?.id !== "pending-ui-run") return false;
  if (isSemanticAnalysisRunActive(latestRun)) return false;
  if (!latestRun) return true;
  return timestampMs(latestRun.started) < timestampMs(currentRun.started);
}

function timestampMs(input: unknown): number {
  const value = typeof input === "string" ? Date.parse(input) : NaN;
  return Number.isFinite(value) ? value : 0;
}
