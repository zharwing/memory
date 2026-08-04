import { makeAutoObservable, runInAction } from "mobx";
import type { ZharwingMemoryClient } from "@zharwing/memory-api-client";
import type { ProjectGraph } from "@zharwing/memory-core";
import { readString, writeString } from "../utils/storage.js";
import type { RootStore } from "./root-store.js";

export type GraphRelationshipMode = "deterministic" | "ai-reviewed";

const GRAPH_RELATIONSHIP_MODE_STORAGE_KEY = "aimem.graph.relationshipMode";

export class GraphStore {
  data: ProjectGraph | undefined = undefined;
  relationshipMode: GraphRelationshipMode = readStoredGraphRelationshipMode();
  loading = false;
  error = "";

  constructor(
    readonly client: ZharwingMemoryClient,
    readonly root: RootStore
  ) {
    makeAutoObservable(this, {
      client: false,
      root: false
    });
  }

  private get projectId() {
    return this.root.projects.selectedProjectId;
  }

  async setRelationshipMode(mode: GraphRelationshipMode) {
    const nextMode = normalizeGraphRelationshipMode(mode);
    if (this.relationshipMode === nextMode) return;
    this.relationshipMode = nextMode;
    writeStoredGraphRelationshipMode(nextMode);
    await this.load();
  }

  async load() {
    if (!this.projectId) return;
    await this.run(async () => {
      const graph = await this.client.call<ProjectGraph>("memory.get_graph", {
        projectId: this.projectId,
        ...graphRelationshipParams(this.relationshipMode)
      });
      runInAction(() => {
        this.data = graph;
      });
    });
  }

  async updateGraphRules(graphRules: any[]) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.update_graph_rules", {
        projectId: this.projectId,
        graphRules
      });
      await this.root.projects.load();
      await this.root.projects.loadSummary();
      await this.load();
    });
  }

  async applyGraphRulesProposal(proposalId: string, graphRules: any[]) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.update_graph_rules", {
        projectId: this.projectId,
        graphRules
      });
      await this.client.call("memory.update_inbox_status", {
        projectId: this.projectId,
        proposalId,
        status: "accepted"
      });
      await this.root.projects.load();
      await this.root.projects.loadSummary();
      await this.root.inbox.load();
      await this.load();
    });
  }

  private async run(work: () => Promise<void>) {
    this.loading = true;
    this.error = "";
    try {
      await work();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
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

function readStoredGraphRelationshipMode(): GraphRelationshipMode {
  return normalizeGraphRelationshipMode(readString(GRAPH_RELATIONSHIP_MODE_STORAGE_KEY));
}

function writeStoredGraphRelationshipMode(mode: GraphRelationshipMode): void {
  writeString(GRAPH_RELATIONSHIP_MODE_STORAGE_KEY, mode);
}
