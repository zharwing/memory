import { makeAutoObservable, runInAction } from "mobx";
import type { MemoryClient } from "@zharwing/memory-api-client";
import type {
  OperationInput,
  SemanticGraphEdge,
  SemanticGraphEdgeStatus,
  SemanticGraphRun,
  SemanticGraphScope,
  SemanticGraphSettings
} from "@zharwing/memory-core";
import { OperationLedger } from "../application/operations/operation-state.js";
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
  type ResourceState
} from "../application/resources/resource-state.js";
import { SemanticAnalysisController } from "./semantic/semantic-analysis-controller.js";
import { SemanticCommandStore } from "./semantic/semantic-command-store.js";
import {
  SEMANTIC_ANALYZE_OPERATION,
  SEMANTIC_PREVIEW_OPERATION
} from "./semantic/semantic-operation-keys.js";
import { SemanticSnapshotClient } from "./semantic/semantic-snapshot-client.js";
import type {
  SemanticAnalysisResult,
  SemanticPreview,
  SemanticStatus
} from "./semantic/semantic-types.js";

/**
 * Public semantic feature facade. Resource identity and operation identity live
 * here; cohesive command and analysis owners operate on those exact instances.
 */
export class SemanticStore {
  readonly settingsResource: ResourceSlot<SemanticGraphSettings>;
  readonly statusResource: ResourceSlot<SemanticStatus>;
  readonly edgesResource: ResourceSlot<SemanticGraphEdge[]>;
  readonly runsResource: ResourceSlot<SemanticGraphRun[]>;
  readonly operations: OperationLedger;

  private readonly snapshots: SemanticSnapshotClient;
  private readonly analysis: SemanticAnalysisController;
  private readonly commands: SemanticCommandStore;
  private readonly unsubscribeScope: () => void;
  private disposed = false;

  constructor(
    private readonly client: MemoryClient,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: SemanticStoreCoordinator,
    scheduler: StoreSchedulerPort,
    private readonly runtime: StoreAsyncRuntimePort
  ) {
    this.settingsResource = new ResourceSlot(this.scope, this.runtime);
    this.statusResource = new ResourceSlot(this.scope, this.runtime);
    this.edgesResource = new ResourceSlot(this.scope, this.runtime);
    this.runsResource = new ResourceSlot(this.scope, this.runtime);
    this.operations = new OperationLedger(this.runtime);
    this.snapshots = new SemanticSnapshotClient(this.client);
    this.analysis = new SemanticAnalysisController({
      client: this.client,
      scope: this.scope,
      coordinator: this.coordinator,
      scheduler,
      runtime: this.runtime,
      snapshots: this.snapshots,
      operations: this.operations,
      statusResource: this.statusResource,
      edgesResource: this.edgesResource,
      runsResource: this.runsResource,
      settings: () => this.settings,
      canUse: (scope) => this.canUse(scope)
    });
    this.commands = new SemanticCommandStore({
      client: this.client,
      scope: this.scope,
      coordinator: this.coordinator,
      snapshots: this.snapshots,
      operations: this.operations,
      settingsResource: this.settingsResource,
      statusResource: this.statusResource,
      edgesResource: this.edgesResource,
      analysis: this.analysis,
      canUse: (scope) => this.canUse(scope),
      loadForScope: (scope) => this.loadForScope(scope)
    });
    this.unsubscribeScope = this.scope.onScopeReset(() => this.clear());

    makeAutoObservable<
      this,
      | "client"
      | "scope"
      | "coordinator"
      | "runtime"
      | "snapshots"
      | "analysis"
      | "commands"
      | "unsubscribeScope"
      | "disposed"
    >(this, {
      client: false,
      scope: false,
      coordinator: false,
      runtime: false,
      settingsResource: false,
      statusResource: false,
      edgesResource: false,
      runsResource: false,
      operations: false,
      snapshots: false,
      analysis: false,
      commands: false,
      unsubscribeScope: false,
      disposed: false,
      pollHandle: false
    });
  }

  /** Compatibility handle retained for lifecycle diagnostics; analysis owns it. */
  get pollHandle(): ReturnType<typeof setTimeout> | undefined {
    return this.analysis.pollHandle;
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
    return operationResult<SemanticPreview>(this.operations, SEMANTIC_PREVIEW_OPERATION);
  }

  get analysisResult(): SemanticAnalysisResult | undefined {
    return operationResult<SemanticAnalysisResult>(this.operations, SEMANTIC_ANALYZE_OPERATION);
  }

  get analysisProgressRun(): SemanticGraphRun | undefined {
    return this.analysis.analysisProgressRun;
  }

  get analysisRunning(): boolean {
    return this.analysis.analysisRunning;
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
    this.analysis.clear();
  }

  setForeground(foreground: boolean): void {
    this.analysis.setForeground(foreground);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeScope();
    this.clear();
    this.analysis.dispose();
  }

  /** Settings and status only; the lighter refresh used on project switch. */
  async refreshStatus(scope = this.scope.captureScope()): Promise<void> {
    if (!scope || !this.scope.isScopeCurrent(scope)) return;

    const settingsAttempt = this.settingsResource.begin(scope);
    const statusAttempt = this.statusResource.begin(scope);
    if (!settingsAttempt || !statusAttempt) return;
    this.analysis.markProgressRequest(statusAttempt.requestId);

    try {
      const { settings, status } = await this.snapshots.getSettingsAndStatus(scope);
      if (!this.canUse(scope)) return;

      runInAction(() => {
        this.settingsResource.succeed(settingsAttempt, settings);
        const accepted = this.statusResource.succeed(statusAttempt, status);
        if (accepted) {
          this.analysis.acceptLatestRun(
            statusAttempt.requestId,
            status.runCounts.latest || this.analysis.analysisProgressRun
          );
        }
      });
      this.analysis.syncPolling(scope);
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
    await this.commands.updateSettings(settings);
  }

  async previewAnalysis(
    analysisScope: SemanticGraphScope | { kind: string; nodeId?: string } = { kind: "all-docs" }
  ): Promise<SemanticPreview | undefined> {
    return this.analysis.previewAnalysis(analysisScope);
  }

  async analyze(args: Omit<OperationInput<"memory.analyze_semantic_graph">, "projectId">): Promise<void> {
    await this.analysis.analyze(args);
  }

  async acceptEdgesProposal(
    proposalId: string,
    options: Omit<
      OperationInput<"memory.accept_semantic_edges_proposal">,
      "projectId" | "proposalId"
    > = {}
  ): Promise<void> {
    await this.commands.acceptEdgesProposal(proposalId, options);
  }

  async updateEdgeStatus(edgeIds: string[], status: SemanticGraphEdgeStatus): Promise<void> {
    await this.commands.updateEdgeStatus(edgeIds, status);
  }

  private async loadForScope(scope: ScopeToken): Promise<void> {
    if (!this.canUse(scope)) return;
    const settingsAttempt = this.settingsResource.begin(scope);
    const statusAttempt = this.statusResource.begin(scope);
    const edgesAttempt = this.edgesResource.begin(scope);
    const runsAttempt = this.runsResource.begin(scope);
    if (!settingsAttempt || !statusAttempt || !edgesAttempt || !runsAttempt) return;
    this.analysis.markProgressRequest(runsAttempt.requestId);

    try {
      const { settings, status, edges, runs } = await this.snapshots.getFull(scope);
      if (!this.canUse(scope)) return;

      runInAction(() => {
        this.settingsResource.succeed(settingsAttempt, settings);
        this.statusResource.succeed(statusAttempt, status);
        this.edgesResource.succeed(edgesAttempt, edges);
        const accepted = this.runsResource.succeed(runsAttempt, runs);
        if (accepted) {
          this.analysis.acceptLatestRun(
            runsAttempt.requestId,
            runs[0] || status.runCounts.latest || this.analysis.analysisProgressRun
          );
        }
      });
      this.analysis.syncPolling(scope);
    } catch (error) {
      runInAction(() => {
        this.settingsResource.fail(settingsAttempt, error);
        this.statusResource.fail(statusAttempt, error);
        this.edgesResource.fail(edgesAttempt, error);
        this.runsResource.fail(runsAttempt, error);
      });
    }
  }

  private canUse(scope: ScopeToken): boolean {
    return !this.disposed && this.scope.isScopeCurrent(scope);
  }
}

function operationResult<Result>(operations: OperationLedger, key: string): Result | undefined {
  const state = operations.state(key);
  return state.status === "succeeded" ? state.result as Result : undefined;
}
