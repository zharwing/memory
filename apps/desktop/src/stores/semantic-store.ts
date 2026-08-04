import { makeAutoObservable, runInAction } from "mobx";
import type { ZharwingMemoryClient } from "@zharwing/memory-api-client";
import type {
  ProjectGraph,
  ProposedMemoryUpdate,
  SemanticGraphEdge,
  SemanticGraphMode,
  SemanticGraphRun,
  SemanticGraphScope,
  SemanticGraphSettings
} from "@zharwing/memory-core";
import { graphRelationshipParams } from "./graph-store.js";
import type { RootStore } from "./root-store.js";

export class SemanticStore {
  settings: SemanticGraphSettings | undefined = undefined;
  status: any = undefined;
  edges: SemanticGraphEdge[] = [];
  runs: SemanticGraphRun[] = [];
  analysisPreview: any = undefined;
  analysisResult: any = undefined;
  analysisProgressRun: SemanticGraphRun | undefined = undefined;
  analysisRunning = false;
  loading = false;
  error = "";
  pollHandle: ReturnType<typeof setInterval> | undefined = undefined;

  constructor(
    readonly client: ZharwingMemoryClient,
    readonly root: RootStore
  ) {
    makeAutoObservable(this, {
      client: false,
      root: false,
      pollHandle: false
    });
  }

  private get projectId() {
    return this.root.projects.selectedProjectId;
  }

  get edgeCounts() {
    return this.status?.edgeCounts || {
      proposed: 0,
      accepted: 0,
      rejected: 0,
      "auto-accepted": 0
    };
  }

  /** Transient run state does not survive a project switch; durable data is reloaded by refreshAll. */
  resetForProjectSwitch() {
    this.analysisResult = undefined;
    this.analysisProgressRun = undefined;
    this.analysisRunning = false;
    this.stopPolling();
  }

  clear() {
    this.settings = undefined;
    this.status = undefined;
    this.edges = [];
    this.runs = [];
    this.analysisPreview = undefined;
    this.analysisResult = undefined;
    this.analysisProgressRun = undefined;
    this.analysisRunning = false;
    this.stopPolling();
  }

  dispose() {
    this.stopPolling();
  }

  /** Settings and status only; the lighter refresh used on project switch. */
  async refreshStatus() {
    if (!this.projectId) return;
    await this.run(async () => {
      const [settings, status] = await Promise.all([
        this.client.call<SemanticGraphSettings>("memory.get_semantic_graph_settings", { projectId: this.projectId }),
        this.client.call("memory.get_semantic_graph_status", { projectId: this.projectId })
      ]);
      runInAction(() => {
        this.settings = settings;
        this.status = status;
        this.analysisProgressRun = (status as any)?.runCounts?.latest || this.analysisProgressRun;
        this.analysisRunning = isSemanticAnalysisRunActive(this.analysisProgressRun);
      });
    });
    this.syncPolling();
  }

  async load() {
    if (!this.projectId) return;
    await this.run(async () => {
      const [settings, status, edges, runs] = await Promise.all([
        this.client.call<SemanticGraphSettings>("memory.get_semantic_graph_settings", { projectId: this.projectId }),
        this.client.call("memory.get_semantic_graph_status", { projectId: this.projectId }),
        this.client.call<SemanticGraphEdge[]>("memory.list_semantic_edges", { projectId: this.projectId }),
        this.client.call<SemanticGraphRun[]>("memory.list_semantic_graph_runs", { projectId: this.projectId })
      ]);
      runInAction(() => {
        this.settings = settings;
        this.status = status;
        this.edges = edges;
        this.runs = runs;
        this.analysisProgressRun = runs[0] || (status as any)?.runCounts?.latest || this.analysisProgressRun;
        this.analysisRunning = isSemanticAnalysisRunActive(this.analysisProgressRun);
      });
    });
    this.syncPolling();
  }

  async updateSettings(settings: Record<string, unknown>) {
    if (!this.projectId) return;
    await this.run(async () => {
      const next = await this.client.call<SemanticGraphSettings>("memory.update_semantic_graph_settings", {
        projectId: this.projectId,
        settings
      });
      const status = await this.client.call("memory.get_semantic_graph_status", {
        projectId: this.projectId
      });
      runInAction(() => {
        this.settings = next;
        this.status = status;
      });
    });
  }

  async previewAnalysis(scope: Record<string, unknown> = { kind: "all-docs" }) {
    if (!this.projectId) return;
    let previewResult: any = undefined;
    await this.run(async () => {
      const preview = await this.client.call("memory.preview_semantic_graph_analysis", {
        projectId: this.projectId,
        scope,
        persistCandidateIndex: true
      });
      const status = await this.client.call("memory.get_semantic_graph_status", {
        projectId: this.projectId
      });
      runInAction(() => {
        this.analysisPreview = preview;
        this.status = status;
      });
      previewResult = preview;
    });
    return previewResult;
  }

  async analyze(args: Record<string, unknown>) {
    if (!this.projectId) return;
    const projectId = this.projectId;
    runInAction(() => {
      this.analysisRunning = true;
      this.analysisProgressRun = createPendingSemanticAnalysisRun(projectId, args);
      this.analysisResult = undefined;
    });
    this.startPolling(projectId);
    await this.run(async () => {
      const result = await this.client.call("memory.analyze_semantic_graph", {
        projectId,
        ...args
      });
      const [status, edges, runs, inbox, graph] = await Promise.all([
        this.client.call("memory.get_semantic_graph_status", { projectId }),
        this.client.call<SemanticGraphEdge[]>("memory.list_semantic_edges", { projectId }),
        this.client.call<SemanticGraphRun[]>("memory.list_semantic_graph_runs", { projectId }),
        this.client.call<ProposedMemoryUpdate[]>("memory.list_inbox", { projectId }),
        this.client.call<ProjectGraph>("memory.get_graph", {
          projectId,
          ...graphRelationshipParams(this.root.graph.relationshipMode)
        })
      ]);
      runInAction(() => {
        if (projectId !== this.projectId) return;
        this.analysisResult = result;
        this.status = status;
        this.edges = edges;
        this.runs = runs;
        this.root.inbox.items = inbox;
        this.root.graph.data = graph;
        this.analysisProgressRun = (result as any)?.run || runs[0];
      });
    });
    this.stopPolling();
    await this.refreshProgress(projectId, true);
    runInAction(() => {
      if (projectId === this.projectId) this.analysisRunning = false;
    });
  }

  async acceptEdgesProposal(proposalId: string, options: Record<string, unknown> = {}) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.accept_semantic_edges_proposal", {
        projectId: this.projectId,
        proposalId,
        ...options
      });
      await this.root.inbox.load();
      await this.root.projects.loadSummary();
      await this.root.graph.load();
      await this.load();
    });
  }

  async updateEdgeStatus(edgeIds: string[], status: string) {
    if (!this.projectId || edgeIds.length === 0) return;
    await this.run(async () => {
      await this.client.call("memory.update_semantic_edge_status", {
        projectId: this.projectId,
        edgeIds,
        status
      });
      const [nextStatus, edges] = await Promise.all([
        this.client.call("memory.get_semantic_graph_status", { projectId: this.projectId }),
        this.client.call<SemanticGraphEdge[]>("memory.list_semantic_edges", { projectId: this.projectId })
      ]);
      runInAction(() => {
        this.status = nextStatus;
        this.edges = edges;
      });
      await this.root.graph.load();
    });
  }

  private startPolling(projectId: string) {
    this.stopPolling();
    void this.refreshProgress(projectId);
    this.pollHandle = setInterval(() => {
      void this.refreshProgress(projectId);
    }, 2000);
  }

  private stopPolling() {
    if (!this.pollHandle) return;
    clearInterval(this.pollHandle);
    this.pollHandle = undefined;
  }

  private async refreshProgress(projectId = this.projectId, includeInbox = false) {
    if (!projectId) return;
    try {
      const [status, runs, inbox] = await Promise.all([
        this.client.call("memory.get_semantic_graph_status", { projectId }),
        this.client.call<SemanticGraphRun[]>("memory.list_semantic_graph_runs", { projectId }),
        includeInbox ? this.client.call<ProposedMemoryUpdate[]>("memory.list_inbox", { projectId }) : Promise.resolve(undefined)
      ]);
      const latestRun = runs[0] || (status as any)?.runCounts?.latest;
      runInAction(() => {
        if (projectId !== this.projectId) return;
        const keepPendingRun = shouldKeepPendingSemanticAnalysisRun(this.analysisProgressRun, latestRun, this.analysisRunning);
        this.status = status;
        this.runs = runs;
        this.analysisProgressRun = keepPendingRun ? this.analysisProgressRun : latestRun;
        this.analysisRunning = keepPendingRun || isSemanticAnalysisRunActive(this.analysisProgressRun);
        if (includeInbox && inbox) this.root.inbox.items = inbox;
      });
      if (
        projectId === this.projectId &&
        !isSemanticAnalysisRunActive(latestRun) &&
        !shouldKeepPendingSemanticAnalysisRun(this.analysisProgressRun, latestRun, this.analysisRunning)
      ) {
        this.stopPolling();
      }
    } catch {
      // Progress polling should not interrupt the foreground run.
    }
  }

  private syncPolling() {
    if (!this.projectId || !isSemanticAnalysisRunActive(this.analysisProgressRun)) {
      if (!this.analysisRunning) this.stopPolling();
      return;
    }
    if (!this.pollHandle) this.startPolling(this.projectId);
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

function isSemanticAnalysisRunActive(run: any): boolean {
  const status = String(run?.status || "");
  return status === "running" || status === "pending";
}

function createPendingSemanticAnalysisRun(projectId: string, args: Record<string, unknown>): SemanticGraphRun {
  return {
    id: "pending-ui-run",
    projectId,
    status: "pending",
    mode: String(args.mode || (args.dryRun ? "dry-run" : "review")) as SemanticGraphMode,
    scope: (args.scope || { kind: "all-docs" }) as SemanticGraphScope,
    model: typeof args.model === "string" ? args.model : undefined,
    started: new Date().toISOString(),
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

function shouldKeepPendingSemanticAnalysisRun(currentRun: any, latestRun: any, currentlyRunning: boolean): boolean {
  if (!currentlyRunning || currentRun?.id !== "pending-ui-run") return false;
  if (isSemanticAnalysisRunActive(latestRun)) return false;
  if (!latestRun) return true;
  return timestampMs(latestRun.started) < timestampMs(currentRun.started);
}

function timestampMs(input: unknown): number {
  const value = typeof input === "string" ? Date.parse(input) : NaN;
  return Number.isFinite(value) ? value : 0;
}
