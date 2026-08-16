import { makeAutoObservable, runInAction } from "mobx";
import type { SemanticClientPort } from "../../application/ports/features.js";
import { parseOperationInput } from "@zharwing/memory-core";
import type {
  OperationInput,
  SemanticGraphEdge,
  SemanticGraphRun,
  SemanticGraphScope,
  SemanticGraphSettings
} from "@zharwing/memory-core";
import type {
  OperationAttempt,
  OperationLedger
} from "../../application/operations/operation-state.js";
import type {
  ScopeToken,
  ScopedProjectPort,
  SemanticStoreCoordinator,
  StoreAsyncRuntimePort,
  StoreSchedulerPort
} from "../../application/operations/store-ports.js";
import type { ResourceSlot } from "../../application/resources/resource-state.js";
import { toPublicError } from "../../application/resources/resource-state.js";
import { graphRelationshipParams } from "../graph-store.js";
import {
  SEMANTIC_ANALYZE_OPERATION,
  SEMANTIC_PREVIEW_OPERATION
} from "./semantic-operation-keys.js";
import { SemanticPollController } from "./semantic-poll-controller.js";
import {
  createPendingSemanticAnalysisRun,
  isSemanticAnalysisRunActive,
  shouldKeepPendingSemanticAnalysisRun
} from "./semantic-run-state.js";
import type { SemanticSnapshotClient } from "./semantic-snapshot-client.js";
import type {
  SemanticAnalysisResult,
  SemanticPollResult,
  SemanticPreview,
  SemanticStatus
} from "./semantic-types.js";

interface ReconciliationFlight {
  readonly scope: ScopeToken;
  readonly promise: Promise<void>;
}

export interface SemanticAnalysisControllerOptions {
  readonly client: SemanticClientPort;
  readonly scope: ScopedProjectPort;
  readonly coordinator: SemanticStoreCoordinator;
  readonly scheduler: StoreSchedulerPort;
  readonly runtime: StoreAsyncRuntimePort;
  readonly snapshots: SemanticSnapshotClient;
  readonly operations: OperationLedger;
  readonly statusResource: ResourceSlot<SemanticStatus>;
  readonly edgesResource: ResourceSlot<SemanticGraphEdge[]>;
  readonly runsResource: ResourceSlot<SemanticGraphRun[]>;
  readonly settings: () => SemanticGraphSettings | undefined;
  readonly canUse: (scope: ScopeToken) => boolean;
}

/** Owns semantic-analysis execution, progress identity, polling and reconciliation. */
export class SemanticAnalysisController {
  private _analysisProgressRun: SemanticGraphRun | undefined = undefined;
  private reconciliationInFlight: ReconciliationFlight | undefined = undefined;
  private analysisReconciliationAttempt: OperationAttempt | undefined = undefined;
  private progressRequestId: string | undefined = undefined;
  private readonly polling: SemanticPollController;

  constructor(private readonly options: SemanticAnalysisControllerOptions) {
    this.polling = new SemanticPollController({
      scope: this.options.scope,
      scheduler: this.options.scheduler,
      canUse: (scope) => this.canUse(scope),
      performPoll: (scope) => this.performPoll(scope)
    });

    makeAutoObservable<
      this,
      | "options"
      | "polling"
      | "reconciliationInFlight"
      | "analysisReconciliationAttempt"
      | "progressRequestId"
    >(this, {
      options: false,
      polling: false,
      reconciliationInFlight: false,
      analysisReconciliationAttempt: false,
      progressRequestId: false,
      pollHandle: false
    });
  }

  /** Compatibility handle retained for lifecycle diagnostics; polling owns it. */
  get pollHandle(): ReturnType<typeof setTimeout> | undefined {
    return this.polling.handle;
  }

  get analysisProgressRun(): SemanticGraphRun | undefined {
    return this._analysisProgressRun;
  }

  get analysisRunning(): boolean {
    const state = this.options.operations.state(SEMANTIC_ANALYZE_OPERATION);
    return this.options.operations.isBusy(SEMANTIC_ANALYZE_OPERATION) ||
      state.status === "reconciling" ||
      isSemanticAnalysisRunActive(this._analysisProgressRun);
  }

  clear(): void {
    this._analysisProgressRun = undefined;
    this.analysisReconciliationAttempt = undefined;
    this.progressRequestId = undefined;
    // The old request is already aborted by the scope coordinator. Detaching
    // its identity lets the new generation poll without waiting for a carrier
    // that is slow to observe cancellation; the old callback still fails all
    // scope/epoch guards and cannot clear or reschedule the new flight.
    this.reconciliationInFlight = undefined;
    this.polling.reset();
  }

  dispose(): void {
    this.polling.dispose();
  }

  setForeground(foreground: boolean): void {
    this.polling.setForeground(
      foreground,
      isSemanticAnalysisRunActive(this._analysisProgressRun)
    );
  }

  markProgressRequest(requestId: string): void {
    this.progressRequestId = requestId;
  }

  acceptLatestRun(requestId: string, run: SemanticGraphRun | undefined): void {
    if (this.progressRequestId !== requestId) return;
    const analyzeState = this.options.operations.state(SEMANTIC_ANALYZE_OPERATION);
    const analyzePending = this.options.operations.isBusy(SEMANTIC_ANALYZE_OPERATION) ||
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

  async previewAnalysis(
    analysisScope: SemanticGraphScope | { kind: string; nodeId?: string } = { kind: "all-docs" }
  ): Promise<SemanticPreview | undefined> {
    const scope = this.options.scope.captureScope();
    if (!scope || !this.options.scope.isScopeCurrent(scope)) return undefined;

    // Decode caller input before creating any observable pending state. A
    // local validation failure therefore cannot leave a phantom operation or
    // refreshing resource behind.
    const input = parseOperationInput("memory.preview_semantic_graph_analysis", {
      projectId: scope.projectId,
      scope: analysisScope,
      persistCandidateIndex: false
    });

    const operation = this.options.operations.begin(SEMANTIC_PREVIEW_OPERATION, scope);
    const statusAttempt = this.options.statusResource.begin(scope);
    if (!statusAttempt) {
      this.options.operations.abandon(operation);
      return undefined;
    }
    this.progressRequestId = statusAttempt.requestId;

    try {
      const preview = await this.options.client.operation(
        "memory.preview_semantic_graph_analysis",
        input,
        { signal: scope.signal }
      );
      const status = await this.options.snapshots.getStatus(scope);
      if (!this.canUse(scope)) {
        this.options.operations.abandon(operation);
        return undefined;
      }

      let accepted = false;
      runInAction(() => {
        const statusAccepted = this.options.statusResource.succeed(statusAttempt, status);
        accepted = this.options.operations.succeed(operation, preview);
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
        this.options.statusResource.cancel(statusAttempt);
        this.options.operations.fail(operation, error);
      });
      return undefined;
    }
  }

  async analyze(args: Omit<OperationInput<"memory.analyze_semantic_graph">, "projectId">): Promise<void> {
    const scope = this.options.scope.captureScope();
    if (!scope || !this.options.scope.isScopeCurrent(scope)) return;

    const input = parseOperationInput("memory.analyze_semantic_graph", {
      ...args,
      // The captured authority is final even if an untyped caller smuggles a
      // projectId through the nominal Omit type.
      projectId: scope.projectId
    });
    const operation = this.options.operations.begin(SEMANTIC_ANALYZE_OPERATION, scope);

    runInAction(() => {
      this.progressRequestId = operation.operationId;
      this._analysisProgressRun = createPendingSemanticAnalysisRun(
        input,
        this.options.settings()?.mode,
        this.options.runtime.now()
      );
    });
    this.startPolling(scope);

    let result: SemanticAnalysisResult;
    try {
      result = await this.options.client.operation(
        "memory.analyze_semantic_graph",
        input,
        { signal: scope.signal }
      );
    } catch (error) {
      if (!this.canUse(scope)) {
        this.options.operations.abandon(operation);
        return;
      }

      const publicError = toPublicError(error);
      runInAction(() => {
        if (publicError.retry === "after-reconcile") {
          this.options.operations.reconcile(operation);
          this.analysisReconciliationAttempt = operation;
        } else {
          this.options.operations.fail(operation, error);
          this.progressRequestId = operation.operationId;
          this._analysisProgressRun = undefined;
        }
      });
      if (publicError.retry === "after-reconcile") this.startPolling(scope);
      else this.stopPolling();
      return;
    }

    if (!this.canUse(scope)) {
      this.options.operations.abandon(operation);
      return;
    }
    runInAction(() => {
      this.progressRequestId = operation.operationId;
      this.options.operations.succeed(operation, result);
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

  syncPolling(scope = this.options.scope.captureScope()): void {
    if (!scope || !this.canUse(scope)) {
      this.stopPolling();
      return;
    }
    const analyzeState = this.options.operations.state(SEMANTIC_ANALYZE_OPERATION);
    if (
      !isSemanticAnalysisRunActive(this._analysisProgressRun) &&
      !this.options.operations.isBusy(SEMANTIC_ANALYZE_OPERATION) &&
      analyzeState.status !== "reconciling"
    ) {
      this.stopPolling();
      return;
    }
    this.startPolling(scope);
  }

  private startPolling(scope: ScopeToken): void {
    this.polling.start(scope);
  }

  private stopPolling(): void {
    this.polling.stop();
  }

  private async performPoll(scope: ScopeToken): Promise<SemanticPollResult> {
    const statusAttempt = this.options.statusResource.begin(scope);
    const runsAttempt = this.options.runsResource.begin(scope);
    if (!statusAttempt || !runsAttempt) return "failure";
    this.progressRequestId = runsAttempt.requestId;

    try {
      const { status, runs } = await this.options.snapshots.getProgress(scope);
      if (!this.canUse(scope)) return "failure";

      const latestRun = runs[0] || status.runCounts.latest;
      let active = false;
      let accepted = false;
      runInAction(() => {
        const statusAccepted = this.options.statusResource.succeed(statusAttempt, status);
        const runsAccepted = this.options.runsResource.succeed(runsAttempt, runs);
        accepted = statusAccepted && runsAccepted && this.progressRequestId === runsAttempt.requestId;
        if (!accepted) return;
        this.acceptLatestRun(runsAttempt.requestId, latestRun);
        active = this.options.operations.isBusy(SEMANTIC_ANALYZE_OPERATION) ||
          this.options.operations.state(SEMANTIC_ANALYZE_OPERATION).status === "reconciling" ||
          isSemanticAnalysisRunActive(this._analysisProgressRun);
      });
      if (!accepted) return "superseded";
      if (active) return "active";

      await this.reconcileAuthoritative(scope);
      if (!this.canUse(scope)) return "failure";
      if (isSemanticAnalysisRunActive(this._analysisProgressRun)) return "active";
      runInAction(() => {
        if (this.analysisReconciliationAttempt) {
          this.options.operations.abandon(this.analysisReconciliationAttempt);
          this.analysisReconciliationAttempt = undefined;
        }
      });
      this.stopPolling();
      return "terminal";
    } catch (error) {
      runInAction(() => {
        this.options.statusResource.fail(statusAttempt, error);
        this.options.runsResource.fail(runsAttempt, error);
      });
      return "failure";
    }
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
    const statusAttempt = this.options.statusResource.begin(scope);
    const edgesAttempt = this.options.edgesResource.begin(scope);
    const runsAttempt = this.options.runsResource.begin(scope);
    if (!statusAttempt || !edgesAttempt || !runsAttempt) return;
    this.progressRequestId = runsAttempt.requestId;

    try {
      const { status, edges, runs, inbox, graph } = await this.options.snapshots.getAuthoritative(
        scope,
        graphRelationshipParams(this.options.coordinator.graphRelationshipMode())
      );
      if (!this.canUse(scope)) return;

      let accepted = false;
      runInAction(() => {
        const statusAccepted = this.options.statusResource.succeed(statusAttempt, status);
        const edgesAccepted = this.options.edgesResource.succeed(edgesAttempt, edges);
        const runsAccepted = this.options.runsResource.succeed(runsAttempt, runs);
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
        this.options.coordinator.replaceInboxItems(inbox);
        this.options.coordinator.replaceGraph(graph);
      });
    } catch (error) {
      runInAction(() => {
        this.options.statusResource.fail(statusAttempt, error);
        this.options.edgesResource.fail(edgesAttempt, error);
        this.options.runsResource.fail(runsAttempt, error);
      });
      throw error;
    }
  }

  private canUse(scope: ScopeToken): boolean {
    return this.options.canUse(scope);
  }
}
