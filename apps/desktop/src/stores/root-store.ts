import { makeAutoObservable, runInAction } from "mobx";
import { AimemClient } from "@aimem/api-client";

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
  semanticGraphSettings: any = undefined;
  semanticGraphStatus: any = undefined;
  semanticEdges: any[] = [];
  semanticGraphRuns: any[] = [];
  contextBundle: any = undefined;
  searchResults: any[] = [];
  importProfiles: any[] = [];
  importPlan: any = undefined;
  importResult: any = undefined;
  backups: any[] = [];
  trashItems: any[] = [];
  loading = false;
  error = "";

  constructor() {
    makeAutoObservable(this);
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

  async loadProjects() {
    await this.run(async () => {
      const projects = (await this.client.call("memory.list_projects")) as any[];
      runInAction(() => {
        this.projects = projects;
        if (!this.selectedProjectId && projects[0]) this.selectedProjectId = projects[0].id;
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

  async selectProject(projectId: string) {
    this.selectedProjectId = projectId;
    await this.refreshProject();
  }

  async refreshProject() {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const [summary, sessions, docs, workstreams, inbox, graph, semanticGraphSettings, semanticGraphStatus, contextBundle] = await Promise.all([
        this.client.call("memory.get_project_summary", { projectId: this.selectedProjectId }),
        this.client.call("memory.list_project_sessions", { projectId: this.selectedProjectId, limit: 20 }),
        this.client.call("memory.list_docs", { projectId: this.selectedProjectId }),
        this.client.call("memory.list_workstreams", { projectId: this.selectedProjectId }),
        this.client.call("memory.list_inbox", { projectId: this.selectedProjectId }),
        this.client.call("memory.get_graph", { projectId: this.selectedProjectId }),
        this.client.call("memory.get_semantic_graph_settings", { projectId: this.selectedProjectId }),
        this.client.call("memory.get_semantic_graph_status", { projectId: this.selectedProjectId }),
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
        this.contextBundle = contextBundle;
      });
    });
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
      });
    });
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

  async acceptSemanticEdgesProposal(proposalId: string) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.accept_semantic_edges_proposal", {
        projectId: this.selectedProjectId,
        proposalId
      });
      await this.refreshProject();
      await this.loadSemanticGraph();
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
        summary: summary.trim() || undefined
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
