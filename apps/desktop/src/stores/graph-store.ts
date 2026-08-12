import { makeAutoObservable } from "mobx";
import type { MemoryClient } from "@zharwing/memory-api-client";
import type { GraphExtractionRule, ProjectGraph } from "@zharwing/memory-core";
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
import { readString, writeString } from "../utils/storage.js";

export type GraphRelationshipMode = "deterministic" | "ai-reviewed";

const GRAPH_RELATIONSHIP_MODE_STORAGE_KEY = "aimem.graph.relationshipMode";

export class GraphStore {
  relationshipMode: GraphRelationshipMode = readStoredGraphRelationshipMode();
  readonly graphResource: ResourceSlot<ProjectGraph>;
  readonly operations: OperationLedger;

  constructor(
    private readonly client: MemoryClient,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: GraphStoreCoordinator,
    runtime: StoreAsyncRuntimePort
  ) {
    this.graphResource = new ResourceSlot(
      scope,
      runtime,
      (graph) => graph.nodes.length === 0 && graph.edges.length === 0
    );
    this.operations = new OperationLedger(runtime);
    makeAutoObservable<this, "client" | "scope" | "coordinator">(this, {
      client: false,
      scope: false,
      coordinator: false,
      graphResource: false,
      operations: false
    });
  }

  get data(): ProjectGraph | undefined {
    return this.graphResource.data;
  }

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
    writeStoredGraphRelationshipMode(nextMode);
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
    const operation = this.operations.begin("update-graph-rules", token);
    try {
      const result = await this.client.operation("memory.update_graph_rules", {
        projectId: token.projectId,
        graphRules
      }, { signal: token.signal });
      if (!this.scope.isScopeCurrent(token)) {
        this.operations.abandon(operation);
        return;
      }
      this.operations.succeed(operation, result);
      await this.refreshAfterRulesChange(token, false);
    } catch (error) {
      this.settleScopedFailure(operation, token, error);
    }
  }

  async applyGraphRulesProposal(
    proposalId: string,
    graphRules: GraphExtractionRule[]
  ): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const operation = this.operations.begin("apply-graph-rules-proposal", token);
    try {
      await this.client.operation("memory.update_graph_rules", {
        projectId: token.projectId,
        graphRules
      }, { signal: token.signal });
      if (!this.scope.isScopeCurrent(token)) {
        this.operations.abandon(operation);
        return;
      }
      const result = await this.client.operation("memory.update_inbox_status", {
        projectId: token.projectId,
        proposalId,
        status: "accepted"
      }, { signal: token.signal });
      if (!this.scope.isScopeCurrent(token)) {
        this.operations.abandon(operation);
        return;
      }
      this.operations.succeed(operation, result);
      await this.refreshAfterRulesChange(token, true);
    } catch (error) {
      this.settleScopedFailure(operation, token, error);
    }
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

  private async refreshAfterRulesChange(token: ScopeToken, refreshInbox: boolean): Promise<void> {
    if (!this.scope.isScopeCurrent(token)) return;
    await this.coordinator.refreshProjects();
    if (!this.scope.isScopeCurrent(token)) return;
    await this.coordinator.refreshProjectSummary();
    if (refreshInbox && this.scope.isScopeCurrent(token)) {
      await this.coordinator.refreshInbox();
    }
    if (this.scope.isScopeCurrent(token)) await this.loadFor(token);
  }

  private settleScopedFailure(
    operation: ReturnType<OperationLedger["begin"]>,
    token: ScopeToken,
    error: unknown
  ): void {
    if (!this.scope.isScopeCurrent(token)) {
      this.operations.abandon(operation);
      return;
    }
    this.operations.fail(operation, error);
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

function readStoredGraphRelationshipMode(): GraphRelationshipMode {
  return normalizeGraphRelationshipMode(readString(GRAPH_RELATIONSHIP_MODE_STORAGE_KEY));
}

function writeStoredGraphRelationshipMode(mode: GraphRelationshipMode): void {
  writeString(GRAPH_RELATIONSHIP_MODE_STORAGE_KEY, mode);
}
