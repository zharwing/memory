import { runInAction } from "mobx";
import type { MemoryClient } from "@zharwing/memory-api-client";
import { parseOperationInput } from "@zharwing/memory-core";
import type {
  OperationInput,
  SemanticGraphEdge,
  SemanticGraphEdgeStatus,
  SemanticGraphRun,
  SemanticGraphSettings
} from "@zharwing/memory-core";
import type { OperationLedger } from "../../application/operations/operation-state.js";
import type {
  ScopeToken,
  ScopedProjectPort,
  SemanticStoreCoordinator
} from "../../application/operations/store-ports.js";
import type { ResourceSlot } from "../../application/resources/resource-state.js";
import { SEMANTIC_UPDATE_SETTINGS_OPERATION } from "./semantic-operation-keys.js";
import type { SemanticSnapshotClient } from "./semantic-snapshot-client.js";
import type { SemanticStatus } from "./semantic-types.js";

export interface SemanticCommandStoreOptions {
  readonly client: MemoryClient;
  readonly scope: ScopedProjectPort;
  readonly coordinator: SemanticStoreCoordinator;
  readonly snapshots: SemanticSnapshotClient;
  readonly operations: OperationLedger;
  readonly settingsResource: ResourceSlot<SemanticGraphSettings>;
  readonly statusResource: ResourceSlot<SemanticStatus>;
  readonly edgesResource: ResourceSlot<SemanticGraphEdge[]>;
  readonly analysis: SemanticCommandAnalysisPort;
  readonly canUse: (scope: ScopeToken) => boolean;
  readonly loadForScope: (scope: ScopeToken) => Promise<void>;
}

export interface SemanticCommandAnalysisPort {
  readonly analysisProgressRun: SemanticGraphRun | undefined;
  markProgressRequest(requestId: string): void;
  acceptLatestRun(requestId: string, run: SemanticGraphRun | undefined): void;
  syncPolling(scope?: ScopeToken): void;
}

/** Owns settings, proposal and edge mutation workflows over facade-owned state. */
export class SemanticCommandStore {
  constructor(private readonly options: SemanticCommandStoreOptions) {}

  async updateSettings(settings: Record<string, unknown>): Promise<void> {
    const scope = this.options.scope.captureScope();
    if (!scope || !this.options.scope.isScopeCurrent(scope)) return;

    const operation = this.options.operations.begin(SEMANTIC_UPDATE_SETTINGS_OPERATION, scope);
    const settingsAttempt = this.options.settingsResource.begin(scope);
    const statusAttempt = this.options.statusResource.begin(scope);
    if (!settingsAttempt || !statusAttempt) {
      this.options.operations.abandon(operation);
      return;
    }
    this.options.analysis.markProgressRequest(statusAttempt.requestId);

    try {
      const next = await this.options.client.operation(
        "memory.update_semantic_graph_settings",
        { projectId: scope.projectId, settings },
        { signal: scope.signal }
      );
      if (!this.canUse(scope)) {
        this.options.operations.abandon(operation);
        return;
      }
      runInAction(() => {
        this.options.settingsResource.succeed(settingsAttempt, next);
        this.options.operations.succeed(operation, next);
      });

      try {
        const status = await this.options.snapshots.getStatus(scope);
        if (!this.canUse(scope)) return;
        runInAction(() => {
          const accepted = this.options.statusResource.succeed(statusAttempt, status);
          if (accepted) {
            this.options.analysis.acceptLatestRun(
              statusAttempt.requestId,
              status.runCounts.latest || this.options.analysis.analysisProgressRun
            );
          }
        });
        this.options.analysis.syncPolling(scope);
      } catch (error) {
        runInAction(() => this.options.statusResource.fail(statusAttempt, error));
      }
    } catch (error) {
      runInAction(() => {
        this.options.settingsResource.cancel(settingsAttempt);
        this.options.statusResource.cancel(statusAttempt);
        this.options.operations.fail(operation, error);
      });
    }
  }

  async acceptEdgesProposal(
    proposalId: string,
    options: Omit<
      OperationInput<"memory.accept_semantic_edges_proposal">,
      "projectId" | "proposalId"
    > = {}
  ): Promise<void> {
    const scope = this.options.scope.captureScope();
    if (!scope || !this.options.scope.isScopeCurrent(scope)) return;

    // Parse before publishing a submitting state and put captured identifiers
    // last so a cast/untyped caller cannot redirect the mutation.
    const input = parseOperationInput("memory.accept_semantic_edges_proposal", {
      ...options,
      projectId: scope.projectId,
      proposalId
    });
    const operation = this.options.operations.begin(`semantic:accept-proposal:${proposalId}`, scope);

    try {
      const result = await this.options.client.operation(
        "memory.accept_semantic_edges_proposal",
        input,
        { signal: scope.signal }
      );
      if (!this.canUse(scope)) {
        this.options.operations.abandon(operation);
        return;
      }
      runInAction(() => {
        this.options.operations.succeed(operation, result);
      });

      if (!this.canUse(scope)) return;
      await this.options.coordinator.refreshInbox();
      if (!this.canUse(scope)) return;
      await this.options.coordinator.refreshProjectSummary();
      if (!this.canUse(scope)) return;
      await this.options.coordinator.refreshGraph();
      if (!this.canUse(scope)) return;
      await this.options.loadForScope(scope);
    } catch (error) {
      runInAction(() => {
        this.options.operations.fail(operation, error);
      });
    }
  }

  async updateEdgeStatus(edgeIds: string[], status: SemanticGraphEdgeStatus): Promise<void> {
    const scope = this.options.scope.captureScope();
    if (!scope || !this.options.scope.isScopeCurrent(scope) || edgeIds.length === 0) return;

    const operation = this.options.operations.begin("semantic:update-edge-status", scope);
    const statusAttempt = this.options.statusResource.begin(scope);
    const edgesAttempt = this.options.edgesResource.begin(scope);
    if (!statusAttempt || !edgesAttempt) {
      this.options.operations.abandon(operation);
      return;
    }
    this.options.analysis.markProgressRequest(statusAttempt.requestId);

    try {
      const result = await this.options.client.operation(
        "memory.update_semantic_edge_status",
        { projectId: scope.projectId, edgeIds, status },
        { signal: scope.signal }
      );
      if (!this.canUse(scope)) {
        this.options.operations.abandon(operation);
        return;
      }
      runInAction(() => this.options.operations.succeed(operation, result));

      try {
        const { status: nextStatus, edges } = await this.options.snapshots.getStatusAndEdges(scope);
        if (!this.canUse(scope)) return;

        runInAction(() => {
          const accepted = this.options.statusResource.succeed(statusAttempt, nextStatus);
          this.options.edgesResource.succeed(edgesAttempt, edges);
          if (accepted) {
            this.options.analysis.acceptLatestRun(
              statusAttempt.requestId,
              nextStatus.runCounts.latest || this.options.analysis.analysisProgressRun
            );
          }
        });
        if (this.canUse(scope)) await this.options.coordinator.refreshGraph();
      } catch (error) {
        runInAction(() => {
          this.options.statusResource.fail(statusAttempt, error);
          this.options.edgesResource.fail(edgesAttempt, error);
        });
      }
    } catch (error) {
      runInAction(() => {
        this.options.statusResource.cancel(statusAttempt);
        this.options.edgesResource.cancel(edgesAttempt);
        this.options.operations.fail(operation, error);
      });
    }
  }

  private canUse(scope: ScopeToken): boolean {
    return this.options.canUse(scope);
  }
}
