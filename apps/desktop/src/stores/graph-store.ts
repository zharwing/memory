import { makeAutoObservable } from "mobx";
import type { GraphClientPort } from "../application/ports/features.js";
import type { GraphExtractionRule, ProjectGraph } from "@zharwing/memory-core";
import type {
  GraphRelationshipMode,
  GraphRelationshipPreferenceStore
} from "../application/persistence/app-persistence.js";
import { OperationLedger } from "../application/operations/operation-state.js";
import type {
  GraphStoreCoordinator,
  ScopedProjectPort,
  ScopeToken,
  StoreAsyncRuntimePort
} from "../application/operations/store-ports.js";
import {
  ResourceSlot,
  publicErrorCopy
} from "../application/resources/resource-state.js";
import { resourceReadModel } from "../application/resources/resource-read-model.js";

export type { GraphRelationshipMode } from "../application/persistence/app-persistence.js";

export class GraphStore {
  relationshipMode: GraphRelationshipMode;
  readonly graphResource: ResourceSlot<ProjectGraph>;
  readonly operations: OperationLedger;

  constructor(
    private readonly client: GraphClientPort,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: GraphStoreCoordinator,
    private readonly preferences: GraphRelationshipPreferenceStore,
    runtime: StoreAsyncRuntimePort
  ) {
    this.relationshipMode = preferences.read();
    this.graphResource = new ResourceSlot(
      scope,
      runtime,
      (graph) => graph.nodes.length === 0 && graph.edges.length === 0
    );
    this.operations = new OperationLedger(runtime);
    makeAutoObservable<this, "client" | "scope" | "coordinator" | "preferences">(this, {
      client: false,
      scope: false,
      coordinator: false,
      preferences: false,
      graphResource: false,
      operations: false
    });
  }

  get data(): ProjectGraph | undefined {
    return this.graphResource.data;
  }

  get graphRead() { return resourceReadModel(this.graphResource); }

  get loading(): boolean {
    return this.graphResource.loading || this.operations.isBusy();
  }

  get error(): string {
    return publicErrorCopy(this.graphResource.error ?? this.operations.error);
  }

  clear(): void {
    this.graphResource.reset();
    this.operations.reset();
  }

  /** Used by semantic refreshes; also invalidates an older graph request. */
  replace(data: ProjectGraph): void {
    const attempt = this.graphResource.begin();
    if (attempt) this.graphResource.succeed(attempt, data);
  }

  async setRelationshipMode(mode: GraphRelationshipMode): Promise<void> {
    const nextMode = normalizeGraphRelationshipMode(mode);
    if (this.relationshipMode === nextMode) return;
    this.relationshipMode = nextMode;
    this.preferences.write(nextMode);
    await this.load();
  }

  async load(token = this.scope.captureScope()): Promise<void> {
    if (!token) {
      this.graphResource.reset();
      return;
    }
    await this.loadFor(token);
  }

  async updateGraphRules(graphRules: GraphExtractionRule[]): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.update_graph_rules",
      input: {
        projectId: token.projectId,
        graphRules
      },
      ledger: this.operations,
      key: "update-graph-rules",
      scope: token
    });
  }

  async applyGraphRulesProposal(
    proposalId: string,
    graphRules: GraphExtractionRule[]
  ): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const updated = await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.update_graph_rules",
      input: {
        projectId: token.projectId,
        graphRules
      },
      ledger: this.operations,
      key: "apply-graph-rules-proposal:rules",
      scope: token
    });
    if (!updated || !this.scope.isScopeCurrent(token)) return;
    await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.update_inbox_status",
      input: {
        projectId: token.projectId,
        proposalId,
        status: "accepted"
      },
      ledger: this.operations,
      key: "apply-graph-rules-proposal:inbox",
      scope: token
    });
  }

  private async loadFor(token: ScopeToken): Promise<void> {
    const attempt = this.graphResource.begin(token);
    if (!attempt) return;
    try {
      const graph = await this.client.operation("memory.get_graph", {
        projectId: token.projectId,
        ...graphRelationshipParams(this.relationshipMode)
      }, { signal: token.signal });
      this.graphResource.succeed(attempt, graph);
    } catch (error) {
      this.graphResource.fail(attempt, error);
    }
  }

}

export function graphRelationshipParams(mode: GraphRelationshipMode): Record<string, unknown> {
  if (mode === "ai-reviewed") {
    return {
      includeSemantic: "accepted",
      includeSemanticProposals: false
    };
  }
  return {
    includeSemantic: "none",
    includeSemanticProposals: false
  };
}

function normalizeGraphRelationshipMode(input: unknown): GraphRelationshipMode {
  return input === "ai-reviewed" || input === "deterministic"
    ? input
    : "ai-reviewed";
}
