import { makeAutoObservable, runInAction } from "mobx";
import { AimemClient } from "@zharwing/memory-api-client";

export type GraphRelationshipMode = "deterministic" | "ai-reviewed";

const GRAPH_RELATIONSHIP_MODE_STORAGE_KEY = "aimem.graph.relationshipMode";

export class RootStore {
  client = new AimemClient();
  projects: any[] = [];
  selectedProjectId = "";
  daemonHealth: any = undefined;
  projectCreationPreview: any = undefined;
  summary: any = undefined;
  sessions: any[] = [];
  docs: any[] = [];
  workstreams: any[] = [];
  selectedWorkstreamId = "";
  workstreamDetail: any = undefined;
  repoLinks: any[] = [];
  inbox: any[] = [];
  graph: any = undefined;
  graphRelationshipMode: GraphRelationshipMode = readStoredGraphRelationshipMode();
  semanticGraphSettings: any = undefined;
  semanticGraphStatus: any = undefined;
  semanticEdges: any[] = [];
  semanticGraphRuns: any[] = [];
  semanticAnalysisPreview: any = undefined;
  semanticAnalysisResult: any = undefined;
  semanticAnalysisProgressRun: any = undefined;
  semanticAnalysisRunning = false;
  assistantStatus: any = undefined;
  assistantProviderCheck: any = undefined;
  contextBundle: any = undefined;
  searchResults: any[] = [];
  importProfiles: any[] = [];
  importPlan: any = undefined;
  importResult: any = undefined;
  mcpDoctor: any = undefined;
  mcpInstallResult: any = undefined;
  backups: any[] = [];
  trashItems: any[] = [];
  loading = false;
  error = "";
  semanticAnalysisPollHandle: ReturnType<typeof setInterval> | undefined = undefined;

  constructor() {
    makeAutoObservable(this, {
      semanticAnalysisPollHandle: false
    });
  }

  get selectedProject() {
    return this.projects.find((project) => project.id === this.selectedProjectId);
  }

  get selectedMemoryWritePolicy() {
    const policy = this.summary?.project?.memoryWritePolicy || this.selectedProject?.memoryWritePolicy || {};
    return {
      allowAgentDirectWrites: policy.allowAgentDirectWrites ?? true,
      reviewMode: policy.reviewMode || "off"
    };
  }

  get semanticGraphEdgeCounts() {
    return this.semanticGraphStatus?.edgeCounts || {
      proposed: 0,
      accepted: 0,
      rejected: 0,
      "auto-accepted": 0
    };
  }

  async loadProjects(preferredProjectId?: string) {
    await this.run(async () => {
      const projects = (await this.client.call("memory.list_projects")) as any[];
      runInAction(() => {
        this.projects = projects;
        const preferred = preferredProjectId
          ? projects.find((project) => project.id === preferredProjectId)
          : undefined;
        const selectedStillExists = projects.some((project) => project.id === this.selectedProjectId);
        if (preferred) this.selectedProjectId = preferred.id;
        else if ((!this.selectedProjectId || !selectedStillExists) && projects[0]) this.selectedProjectId = projects[0].id;
      });
    });
  }

  async loadDaemonHealth() {
    await this.run(async () => {
      const health = await this.client.call("memory.health");
      runInAction(() => {
        this.daemonHealth = health;
      });
    });
  }

  async loadMcpDoctor() {
    await this.run(async () => {
      const result = await this.client.call("memory.mcp_doctor");
      runInAction(() => {
        this.mcpDoctor = result;
      });
    });
  }

  async installMcpClient(client: "auto" | "codex" | "claude-code" | "claude-desktop", transport = "http") {
    await this.run(async () => {
      const result = await this.client.call("memory.mcp_install", {
        client,
        transport,
        authMode: "auto"
      });
      runInAction(() => {
        this.mcpInstallResult = result;
      });
      await this.loadMcpDoctor();
    });
  }

  async selectProject(projectId: string) {
    this.selectedProjectId = projectId;
    this.semanticAnalysisResult = undefined;
    this.semanticAnalysisProgressRun = undefined;
    this.semanticAnalysisRunning = false;
    this.stopSemanticAnalysisPolling();
    this.assistantProviderCheck = undefined;
    await this.refreshProject();
  }

  async refreshProject() {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const [summary, sessions, docs, workstreams, inbox, graph, semanticGraphSettings, semanticGraphStatus, assistantStatus, contextBundle] = await Promise.all([
        this.client.call("memory.get_project_summary", { projectId: this.selectedProjectId }),
        this.client.call("memory.list_project_sessions", { projectId: this.selectedProjectId, limit: 20 }),
        this.client.call("memory.list_docs", { projectId: this.selectedProjectId }),
        this.client.call("memory.list_workstreams", { projectId: this.selectedProjectId }),
        this.client.call("memory.list_inbox", { projectId: this.selectedProjectId }),
        this.client.call("memory.get_graph", {
          projectId: this.selectedProjectId,
          ...graphRelationshipParams(this.graphRelationshipMode)
        }),
        this.client.call("memory.get_semantic_graph_settings", { projectId: this.selectedProjectId }),
        this.client.call("memory.get_semantic_graph_status", { projectId: this.selectedProjectId }),
        this.client.call("memory.assistant_status", { projectId: this.selectedProjectId }),
        this.client.call("memory.preview_context_bundle", { projectId: this.selectedProjectId, requestedBy: "desktop" })
      ]);
      runInAction(() => {
        this.summary = summary;
        this.sessions = sessions as any[];
        this.docs = docs as any[];
        this.workstreams = workstreams as any[];
        if (!this.selectedWorkstreamId && this.workstreams[0]) this.selectedWorkstreamId = this.workstreams[0].id;
        this.repoLinks = (summary as any)?.project?.repos || [];
        this.inbox = inbox as any[];
        this.graph = graph;
        this.semanticGraphSettings = semanticGraphSettings;
        this.semanticGraphStatus = semanticGraphStatus;
        this.semanticAnalysisProgressRun = (semanticGraphStatus as any)?.runCounts?.latest || this.semanticAnalysisProgressRun;
        this.semanticAnalysisRunning = isSemanticAnalysisRunActive(this.semanticAnalysisProgressRun);
        this.assistantStatus = assistantStatus;
        this.contextBundle = contextBundle;
      });
    });
    this.syncSemanticAnalysisPolling();
    if (this.selectedWorkstreamId) await this.loadWorkstreamDetail(this.selectedWorkstreamId);
  }

  async prepareProjectCreation(args: {
    workingDirectory?: string;
    projectName?: string;
    createPointerFile: boolean;
    bootstrapFiles?: string[];
  }) {
    await this.run(async () => {
      const preview = await this.client.call("memory.prepare_project_creation", {
        workingDirectory: args.workingDirectory?.trim() || undefined,
        projectName: args.projectName?.trim() || undefined,
        createPointerFile: args.createPointerFile,
        bootstrapFiles: args.bootstrapFiles || []
      });
      runInAction(() => {
        this.projectCreationPreview = preview;
      });
    });
  }

  async createProjectFromPreview() {
    if (!this.projectCreationPreview) return false;
    let createdProjectId = "";
    await this.run(async () => {
      const project = await this.client.call("memory.create_project", {
        preview: this.projectCreationPreview
      });
      createdProjectId = (project as any).id;
      await this.loadProjects();
      runInAction(() => {
        this.selectedProjectId = createdProjectId;
        this.projectCreationPreview = undefined;
      });
      await this.refreshProject();
    });
    return Boolean(createdProjectId && this.selectedProjectId === createdProjectId && !this.error);
  }

  async deleteProject(projectId: string) {
    await this.run(async () => {
      await this.client.call("memory.delete_project", { projectId });
      await this.loadProjects();
      runInAction(() => {
        if (this.selectedProjectId === projectId) {
          this.selectedProjectId = this.projects[0]?.id || "";
          this.summary = undefined;
          this.sessions = [];
          this.docs = [];
          this.workstreams = [];
          this.repoLinks = [];
          this.semanticGraphSettings = undefined;
          this.semanticGraphStatus = undefined;
          this.semanticEdges = [];
          this.semanticGraphRuns = [];
          this.semanticAnalysisPreview = undefined;
          this.semanticAnalysisResult = undefined;
          this.semanticAnalysisProgressRun = undefined;
          this.semanticAnalysisRunning = false;
          this.stopSemanticAnalysisPolling();
          this.assistantStatus = undefined;
          this.assistantProviderCheck = undefined;
        }
      });
      if (this.selectedProjectId) await this.refreshProject();
      await this.loadTrash();
    });
  }

  async updateMemoryWritePolicy(args: {
    allowAgentDirectWrites?: boolean;
    reviewMode?: string;
  }) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.update_memory_write_policy", {
        projectId: this.selectedProjectId,
        ...args
      });
      await this.loadProjects();
      await this.refreshProject();
    });
  }

  async updateAssistantPolicy(policy: Record<string, unknown>) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.update_assistant_policy", {
        projectId: this.selectedProjectId,
        policy
      });
      await this.loadProjects();
      await this.refreshProject();
    });
  }

  async checkAssistantProvider(args: Record<string, unknown> = {}) {
    if (!this.selectedProjectId) return undefined;
    let result: any = undefined;
    await this.run(async () => {
      try {
        result = await this.client.call("memory.check_semantic_graph_provider", {
          projectId: this.selectedProjectId,
          ...args
        });
        runInAction(() => {
          this.assistantProviderCheck = result;
        });
      } catch (error) {
        result = {
          ok: false,
          endpoint: String(args.endpoint || ""),
          model: String(args.model || ""),
          latencyMs: 0,
          message: error instanceof Error ? error.message : String(error)
        };
        runInAction(() => {
          this.assistantProviderCheck = result;
        });
        throw error;
      }
    });
    return result;
  }

  async setGraphRelationshipMode(mode: GraphRelationshipMode) {
    const nextMode = normalizeGraphRelationshipMode(mode);
    if (this.graphRelationshipMode === nextMode) return;
    this.graphRelationshipMode = nextMode;
    writeStoredGraphRelationshipMode(nextMode);
    await this.loadGraph();
  }

  async loadGraph() {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const graph = await this.client.call("memory.get_graph", {
        projectId: this.selectedProjectId,
        ...graphRelationshipParams(this.graphRelationshipMode)
      });
      runInAction(() => {
        this.graph = graph;
      });
    });
  }

  async updateGraphRules(graphRules: any[]) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.update_graph_rules", {
        projectId: this.selectedProjectId,
        graphRules
      });
      await this.loadProjects();
      await this.refreshProject();
    });
  }

  async loadSemanticGraph() {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const [settings, status, edges, runs] = await Promise.all([
        this.client.call("memory.get_semantic_graph_settings", { projectId: this.selectedProjectId }),
        this.client.call("memory.get_semantic_graph_status", { projectId: this.selectedProjectId }),
        this.client.call("memory.list_semantic_edges", { projectId: this.selectedProjectId }),
        this.client.call("memory.list_semantic_graph_runs", { projectId: this.selectedProjectId })
      ]);
      runInAction(() => {
        this.semanticGraphSettings = settings;
        this.semanticGraphStatus = status;
        this.semanticEdges = edges as any[];
        this.semanticGraphRuns = runs as any[];
        this.semanticAnalysisProgressRun = (runs as any[])[0] || (status as any)?.runCounts?.latest || this.semanticAnalysisProgressRun;
        this.semanticAnalysisRunning = isSemanticAnalysisRunActive(this.semanticAnalysisProgressRun);
      });
    });
    this.syncSemanticAnalysisPolling();
  }

  async updateSemanticGraphSettings(settings: Record<string, unknown>) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const next = await this.client.call("memory.update_semantic_graph_settings", {
        projectId: this.selectedProjectId,
        settings
      });
      const status = await this.client.call("memory.get_semantic_graph_status", {
        projectId: this.selectedProjectId
      });
      runInAction(() => {
        this.semanticGraphSettings = next;
        this.semanticGraphStatus = status;
      });
    });
  }

  async previewSemanticGraphAnalysis(scope: Record<string, unknown> = { kind: "all-docs" }) {
    if (!this.selectedProjectId) return;
    let previewResult: any = undefined;
    await this.run(async () => {
      const preview = await this.client.call("memory.preview_semantic_graph_analysis", {
        projectId: this.selectedProjectId,
        scope,
        persistCandidateIndex: true
      });
      const status = await this.client.call("memory.get_semantic_graph_status", {
        projectId: this.selectedProjectId
      });
      runInAction(() => {
        this.semanticAnalysisPreview = preview;
        this.semanticGraphStatus = status;
      });
      previewResult = preview;
    });
    return previewResult;
  }

  async analyzeSemanticGraph(args: Record<string, unknown>) {
    if (!this.selectedProjectId) return;
    const projectId = this.selectedProjectId;
    runInAction(() => {
      this.semanticAnalysisRunning = true;
      this.semanticAnalysisProgressRun = createPendingSemanticAnalysisRun(projectId, args);
      this.semanticAnalysisResult = undefined;
    });
    this.startSemanticAnalysisPolling(projectId);
    await this.run(async () => {
      const result = await this.client.call("memory.analyze_semantic_graph", {
        projectId,
        ...args
      });
      const [status, edges, runs, inbox, graph] = await Promise.all([
        this.client.call("memory.get_semantic_graph_status", { projectId }),
        this.client.call("memory.list_semantic_edges", { projectId }),
        this.client.call("memory.list_semantic_graph_runs", { projectId }),
        this.client.call("memory.list_inbox", { projectId }),
        this.client.call("memory.get_graph", {
          projectId,
          ...graphRelationshipParams(this.graphRelationshipMode)
        })
      ]);
      runInAction(() => {
        if (projectId !== this.selectedProjectId) return;
        this.semanticAnalysisResult = result;
        this.semanticGraphStatus = status;
        this.semanticEdges = edges as any[];
        this.semanticGraphRuns = runs as any[];
        this.inbox = inbox as any[];
        this.graph = graph;
        this.semanticAnalysisProgressRun = (result as any)?.run || (runs as any[])[0];
      });
    });
    this.stopSemanticAnalysisPolling();
    await this.refreshSemanticAnalysisProgress(projectId, true);
    runInAction(() => {
      if (projectId === this.selectedProjectId) this.semanticAnalysisRunning = false;
    });
  }

  private startSemanticAnalysisPolling(projectId: string) {
    this.stopSemanticAnalysisPolling();
    void this.refreshSemanticAnalysisProgress(projectId);
    this.semanticAnalysisPollHandle = setInterval(() => {
      void this.refreshSemanticAnalysisProgress(projectId);
    }, 2000);
  }

  private stopSemanticAnalysisPolling() {
    if (!this.semanticAnalysisPollHandle) return;
    clearInterval(this.semanticAnalysisPollHandle);
    this.semanticAnalysisPollHandle = undefined;
  }

  private async refreshSemanticAnalysisProgress(projectId = this.selectedProjectId, includeInbox = false) {
    if (!projectId) return;
    try {
      const [status, runs, inbox] = await Promise.all([
        this.client.call("memory.get_semantic_graph_status", { projectId }),
        this.client.call("memory.list_semantic_graph_runs", { projectId }),
        includeInbox ? this.client.call("memory.list_inbox", { projectId }) : Promise.resolve(undefined)
      ]);
      const latestRun = (runs as any[])[0] || (status as any)?.runCounts?.latest;
      runInAction(() => {
        if (projectId !== this.selectedProjectId) return;
        const keepPendingRun = shouldKeepPendingSemanticAnalysisRun(this.semanticAnalysisProgressRun, latestRun, this.semanticAnalysisRunning);
        this.semanticGraphStatus = status;
        this.semanticGraphRuns = runs as any[];
        this.semanticAnalysisProgressRun = keepPendingRun ? this.semanticAnalysisProgressRun : latestRun;
        this.semanticAnalysisRunning = keepPendingRun || isSemanticAnalysisRunActive(this.semanticAnalysisProgressRun);
        if (includeInbox && inbox) this.inbox = inbox as any[];
      });
      if (
        projectId === this.selectedProjectId &&
        !isSemanticAnalysisRunActive(latestRun) &&
        !shouldKeepPendingSemanticAnalysisRun(this.semanticAnalysisProgressRun, latestRun, this.semanticAnalysisRunning)
      ) {
        this.stopSemanticAnalysisPolling();
      }
    } catch {
      // Progress polling should not interrupt the foreground run.
    }
  }

  private syncSemanticAnalysisPolling() {
    if (!this.selectedProjectId || !isSemanticAnalysisRunActive(this.semanticAnalysisProgressRun)) {
      if (!this.semanticAnalysisRunning) this.stopSemanticAnalysisPolling();
      return;
    }
    if (!this.semanticAnalysisPollHandle) this.startSemanticAnalysisPolling(this.selectedProjectId);
  }

  async acceptSemanticEdgesProposal(proposalId: string, options: Record<string, unknown> = {}) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.accept_semantic_edges_proposal", {
        projectId: this.selectedProjectId,
        proposalId,
        ...options
      });
      await this.refreshProject();
      await this.loadSemanticGraph();
    });
  }

  async updateSemanticEdgeStatus(edgeIds: string[], status: string) {
    if (!this.selectedProjectId || edgeIds.length === 0) return;
    await this.run(async () => {
      await this.client.call("memory.update_semantic_edge_status", {
        projectId: this.selectedProjectId,
        edgeIds,
        status
      });
      const [semanticGraphStatus, semanticEdges, graph] = await Promise.all([
        this.client.call("memory.get_semantic_graph_status", { projectId: this.selectedProjectId }),
        this.client.call("memory.list_semantic_edges", { projectId: this.selectedProjectId }),
        this.client.call("memory.get_graph", {
          projectId: this.selectedProjectId,
          ...graphRelationshipParams(this.graphRelationshipMode)
        })
      ]);
      runInAction(() => {
        this.semanticGraphStatus = semanticGraphStatus;
        this.semanticEdges = semanticEdges as any[];
        this.graph = graph;
      });
    });
  }

  async applyGraphRulesProposal(proposalId: string, graphRules: any[]) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.update_graph_rules", {
        projectId: this.selectedProjectId,
        graphRules
      });
      await this.client.call("memory.update_inbox_status", {
        projectId: this.selectedProjectId,
        proposalId,
        status: "accepted"
      });
      await this.loadProjects();
      await this.refreshProject();
    });
  }

  async loadRepoLinks() {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const repos = await this.client.call("memory.list_project_repos", {
        projectId: this.selectedProjectId
      });
      runInAction(() => {
        this.repoLinks = repos as any[];
      });
    });
  }

  async linkRepo(args: {
    repoPath: string;
    role: string;
    name?: string;
    description?: string;
    defaultBranch?: string;
    writePointerFile: boolean;
  }) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.link_repo", {
        projectId: this.selectedProjectId,
        repoPath: args.repoPath,
        role: args.role,
        name: args.name || undefined,
        description: args.description || undefined,
        defaultBranch: args.defaultBranch || undefined,
        writePointerFile: args.writePointerFile
      });
      await this.loadProjects();
      await this.refreshProject();
      await this.loadRepoLinks();
    });
  }

  async unlinkRepo(repoPath: string, removePointerFile: boolean) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.unlink_repo", {
        projectId: this.selectedProjectId,
        repoPath,
        removePointerFile
      });
      await this.loadProjects();
      await this.refreshProject();
      await this.loadRepoLinks();
    });
  }

  async deleteRepo(repoPath: string, removePointerFile = true) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.delete_repo", {
        projectId: this.selectedProjectId,
        repoPath,
        removePointerFile
      });
      await this.loadProjects();
      await this.refreshProject();
      await this.loadRepoLinks();
      await this.loadTrash();
    });
  }

  async loadWorkstreams() {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const workstreams = await this.client.call("memory.list_workstreams", {
        projectId: this.selectedProjectId
      });
      runInAction(() => {
        this.workstreams = workstreams as any[];
        if (!this.selectedWorkstreamId && this.workstreams[0]) this.selectedWorkstreamId = this.workstreams[0].id;
      });
    });
  }

  async createWorkstream(args: {
    name: string;
    summary?: string;
    goal?: string;
    topics?: string[];
    repoRoles?: string[];
    relatedTasks?: string[];
    relatedFiles?: string[];
  }) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const workstream = await this.client.call("memory.create_workstream", {
        projectId: this.selectedProjectId,
        ...args
      });
      await this.loadWorkstreams();
      runInAction(() => {
        this.selectedWorkstreamId = (workstream as any).id;
      });
      await this.loadWorkstreamDetail((workstream as any).id);
    });
  }

  async selectWorkstream(workstreamId: string) {
    this.selectedWorkstreamId = workstreamId;
    await this.loadWorkstreamDetail(workstreamId);
  }

  async loadWorkstreamDetail(workstreamId = this.selectedWorkstreamId) {
    if (!this.selectedProjectId || !workstreamId) return;
    await this.run(async () => {
      const detail = await this.client.call("memory.get_workstream_detail", {
        projectId: this.selectedProjectId,
        workstreamId
      });
      runInAction(() => {
        this.workstreamDetail = detail;
      });
    });
  }

  async updateWorkstreamStatus(workstreamId: string, status: string) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.update_workstream_status", {
        projectId: this.selectedProjectId,
        workstreamId,
        status
      });
      await this.loadWorkstreams();
      await this.loadWorkstreamDetail(workstreamId);
    });
  }

  async deleteWorkstream(workstreamId: string) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.delete_workstream", {
        projectId: this.selectedProjectId,
        workstreamId
      });
      runInAction(() => {
        if (this.selectedWorkstreamId === workstreamId) {
          this.selectedWorkstreamId = "";
          this.workstreamDetail = undefined;
        }
      });
      await this.loadWorkstreams();
      await this.refreshProject();
      await this.loadTrash();
    });
  }

  async loadImportProfiles() {
    await this.run(async () => {
      const profiles = await this.client.call("memory.list_import_profiles");
      runInAction(() => {
        this.importProfiles = profiles as any[];
      });
    });
  }

  async prepareImport(args: {
    sourceRoot: string;
    profile: string;
    limit?: number;
  }) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const plan = await this.client.call("memory.prepare_import", {
        projectId: this.selectedProjectId,
        sourceRoot: args.sourceRoot,
        profile: args.profile,
        limit: args.limit
      });
      runInAction(() => {
        this.importPlan = plan;
        this.importResult = undefined;
      });
    });
  }

  async commitImport(conflictStrategy: string) {
    if (!this.selectedProjectId || !this.importPlan) return;
    await this.run(async () => {
      const result = await this.client.call("memory.commit_import", {
        projectId: this.selectedProjectId,
        plan: this.importPlan,
        conflictStrategy
      });
      await this.refreshProject();
      runInAction(() => {
        this.importResult = result;
      });
    });
  }

  async deleteSession(sessionId: string) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.delete_session", {
        projectId: this.selectedProjectId,
        sessionId
      });
      await this.refreshProject();
      await this.loadTrash();
    });
  }

  async deleteDocument(documentId: string) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.delete_doc", {
        projectId: this.selectedProjectId,
        documentId
      });
      await this.refreshProject();
      await this.loadTrash();
    });
  }

  async updateDocument(documentId: string, args: { title?: string; body?: string }) {
    if (!this.selectedProjectId) return undefined;
    let updatedDocument: any = undefined;
    await this.run(async () => {
      updatedDocument = await this.client.call("memory.update_doc", {
        projectId: this.selectedProjectId,
        documentId,
        title: args.title,
        body: args.body
      });
      await this.refreshProject();
    });
    return updatedDocument;
  }

  async deleteInboxItem(proposalId: string) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.delete_inbox_item", {
        projectId: this.selectedProjectId,
        proposalId
      });
      await this.refreshProject();
      await this.loadTrash();
    });
  }

  async updateInboxStatus(proposalId: string, status: string, editedPatch?: string) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.update_inbox_status", {
        projectId: this.selectedProjectId,
        proposalId,
        status,
        editedPatch
      });
      await this.refreshProject();
    });
  }

  async loadBackups() {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const backups = await this.client.call("memory.list_backups", {
        projectId: this.selectedProjectId
      });
      runInAction(() => {
        this.backups = backups as any[];
      });
    });
  }

  async createBackup() {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.backup_project", { projectId: this.selectedProjectId });
      await this.loadBackups();
    });
  }

  async deleteBackup(snapshotPath: string) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.delete_backup", {
        projectId: this.selectedProjectId,
        snapshotPath
      });
      await this.loadBackups();
      await this.loadTrash();
    });
  }

  async loadTrash() {
    await this.run(async () => {
      const items = await this.client.call("memory.list_trash");
      runInAction(() => {
        this.trashItems = items as any[];
      });
    });
  }

  async restoreTrashItem(trashItemId: string) {
    await this.run(async () => {
      await this.client.call("memory.restore_trash_item", { trashItemId });
      await this.loadProjects();
      if (this.selectedProjectId) await this.refreshProject();
      await this.loadTrash();
    });
  }

  async purgeTrashItem(trashItemId: string) {
    await this.run(async () => {
      await this.client.call("memory.purge_trash_item", { trashItemId });
      await this.loadTrash();
    });
  }

  async emptyTrash(trashItemIds?: string[]) {
    await this.run(async () => {
      await this.client.call("memory.empty_trash", { trashItemIds });
      await this.loadTrash();
    });
  }

  async startSession(taskTitle = "", workstreamIds: string[] = []) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.start_session", {
        projectId: this.selectedProjectId,
        taskTitle: taskTitle.trim() || undefined,
        agent: "manual",
        client: "desktop",
        workingDirectory: this.selectedProject?.repos?.[0]?.path,
        workstreamIds
      });
      await this.refreshProject();
    });
  }

  async closeSession(sessionId: string, summary = "") {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.close_session", {
        projectId: this.selectedProjectId,
        sessionId,
        summary: summary.trim() || undefined,
        autoSummarize: true
      });
      await this.refreshProject();
    });
  }

  async generateSessionSummary(sessionId: string, force = true) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.generate_session_summary", {
        projectId: this.selectedProjectId,
        sessionId,
        force
      });
      await this.refreshProject();
    });
  }

  async generateSessionSummaries(mode: "missing" | "all" = "missing") {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.generate_session_summaries", {
        projectId: this.selectedProjectId,
        mode
      });
      await this.refreshProject();
    });
  }

  async loadAllSessions() {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const sessions = await this.client.call("memory.list_project_sessions", {
        projectId: this.selectedProjectId
      });
      runInAction(() => {
        this.sessions = sessions as any[];
      });
    });
  }

  async saveCheckpoint(sessionId: string, summary: string) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.save_checkpoint", {
        projectId: this.selectedProjectId,
        sessionId,
        summary
      });
      await this.refreshProject();
    });
  }

  async search(query: string) {
    if (!this.selectedProjectId || !query.trim()) {
      this.searchResults = [];
      return;
    }
    await this.run(async () => {
      const results = await this.client.call("memory.search", {
        projectId: this.selectedProjectId,
        query
      });
      runInAction(() => {
        this.searchResults = results as any[];
      });
    });
  }

  async run(work: () => Promise<void>) {
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

function graphRelationshipParams(mode: GraphRelationshipMode): Record<string, unknown> {
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
  try {
    if (typeof window === "undefined") return "ai-reviewed";
    return normalizeGraphRelationshipMode(window.localStorage.getItem(GRAPH_RELATIONSHIP_MODE_STORAGE_KEY));
  } catch {
    return "ai-reviewed";
  }
}

function writeStoredGraphRelationshipMode(mode: GraphRelationshipMode): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(GRAPH_RELATIONSHIP_MODE_STORAGE_KEY, mode);
    }
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
}

function isSemanticAnalysisRunActive(run: any): boolean {
  const status = String(run?.status || "");
  return status === "running" || status === "pending";
}

function createPendingSemanticAnalysisRun(projectId: string, args: Record<string, unknown>): any {
  return {
    id: "pending-ui-run",
    projectId,
    status: "pending",
    mode: String(args.mode || (args.dryRun ? "dry-run" : "review")),
    scope: args.scope || { kind: "all-docs" },
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
