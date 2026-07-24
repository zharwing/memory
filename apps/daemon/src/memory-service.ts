import { ProjectRegistry } from "@zharwing/memory-store";
import { AssistantService } from "./services/assistant-service.js";
import { BackupService } from "./services/backup-service.js";
import { ContextService } from "./services/context-service.js";
import { DocumentService } from "./services/document-service.js";
import { GraphService } from "./services/graph-service.js";
import { ImportService } from "./services/import-service.js";
import { InboxService } from "./services/inbox-service.js";
import { ProjectService } from "./services/project-service.js";
import { SearchService } from "./services/search-service.js";
import { SemanticGraphService } from "./services/semantic-graph-service.js";
import { SessionService } from "./services/session-service.js";
import { TrashService } from "./services/trash-service.js";
import { WorkstreamService } from "./services/workstream-service.js";

export interface MemoryServiceOptions {
  memoryRoot: string;
}

/**
 * Facade over the daemon domain services. RPC, CLI, and MCP adapters call this
 * single surface; each method delegates to the service that owns the domain.
 */
export class MemoryService {
  readonly registry: ProjectRegistry;

  private readonly projects: ProjectService;
  private readonly workstreams: WorkstreamService;
  private readonly sessions: SessionService;
  private readonly documents: DocumentService;
  private readonly imports: ImportService;
  private readonly context: ContextService;
  private readonly searchService: SearchService;
  private readonly graph: GraphService;
  private readonly semanticGraph: SemanticGraphService;
  private readonly inbox: InboxService;
  private readonly backups: BackupService;
  private readonly trash: TrashService;
  private readonly assistant: AssistantService;

  constructor(options: MemoryServiceOptions) {
    this.registry = new ProjectRegistry(options.memoryRoot);
    this.projects = new ProjectService(this.registry);
    this.workstreams = new WorkstreamService(this.registry);
    this.sessions = new SessionService(this.registry);
    this.documents = new DocumentService(this.registry);
    this.imports = new ImportService(this.registry);
    this.context = new ContextService(this.registry);
    this.searchService = new SearchService(this.registry);
    this.graph = new GraphService(this.registry);
    this.semanticGraph = new SemanticGraphService(this.registry);
    this.inbox = new InboxService(this.registry);
    this.backups = new BackupService(this.registry);
    this.trash = new TrashService(this.registry);
    this.assistant = new AssistantService(this.registry);
  }

  // Projects, repos, policies

  async listProjects() {
    return this.projects.listProjects();
  }

  async getProject(projectId: string) {
    return this.projects.getProject(projectId);
  }

  async detectProject(params: Parameters<ProjectService["detectProject"]>[0]) {
    return this.projects.detectProject(params);
  }

  async getStartupState(params: Parameters<ProjectService["getStartupState"]>[0]) {
    return this.projects.getStartupState(params);
  }

  async prepareProjectCreation(params: Parameters<ProjectService["prepareProjectCreation"]>[0]) {
    return this.projects.prepareProjectCreation(params);
  }

  async createProject(params: Parameters<ProjectService["createProject"]>[0]) {
    return this.projects.createProject(params);
  }

  async getProjectSummary(params: Parameters<ProjectService["getProjectSummary"]>[0]) {
    return this.projects.getProjectSummary(params);
  }

  async updateMemoryWritePolicy(params: Parameters<ProjectService["updateMemoryWritePolicy"]>[0]) {
    return this.projects.updateMemoryWritePolicy(params);
  }

  async updateAssistantPolicy(params: Parameters<ProjectService["updateAssistantPolicy"]>[0]) {
    return this.projects.updateAssistantPolicy(params);
  }

  async updateGraphRules(params: Parameters<ProjectService["updateGraphRules"]>[0]) {
    return this.projects.updateGraphRules(params);
  }

  async ensureProject(params: Parameters<ProjectService["ensureProject"]>[0]) {
    return this.projects.ensureProject(params);
  }

  async listProjectRepos(params: Parameters<ProjectService["listProjectRepos"]>[0]) {
    return this.projects.listProjectRepos(params);
  }

  async linkRepo(params: Parameters<ProjectService["linkRepo"]>[0]) {
    return this.projects.linkRepo(params);
  }

  async unlinkRepo(params: Parameters<ProjectService["unlinkRepo"]>[0]) {
    return this.projects.unlinkRepo(params);
  }

  async deleteProject(params: Parameters<ProjectService["deleteProject"]>[0]) {
    return this.projects.deleteProject(params);
  }

  async deleteRepo(params: Parameters<ProjectService["deleteRepo"]>[0]) {
    return this.projects.deleteRepo(params);
  }

  async validateProject(params: Parameters<ProjectService["validateProject"]>[0]) {
    return this.projects.validateProject(params);
  }

  async rebuildIndex(params: Parameters<ProjectService["rebuildIndex"]>[0]) {
    return this.projects.rebuildIndex(params);
  }

  async exportProjectManifest(params: Parameters<ProjectService["exportProjectManifest"]>[0]) {
    return this.projects.exportProjectManifest(params);
  }

  // Workstreams

  async listWorkstreams(params: Parameters<WorkstreamService["listWorkstreams"]>[0]) {
    return this.workstreams.listWorkstreams(params);
  }

  async createWorkstream(params: Parameters<WorkstreamService["createWorkstream"]>[0]) {
    return this.workstreams.createWorkstream(params);
  }

  async getWorkstreamDetail(params: Parameters<WorkstreamService["getWorkstreamDetail"]>[0]) {
    return this.workstreams.getWorkstreamDetail(params);
  }

  async updateWorkstreamStatus(params: Parameters<WorkstreamService["updateWorkstreamStatus"]>[0]) {
    return this.workstreams.updateWorkstreamStatus(params);
  }

  async deleteWorkstream(params: Parameters<WorkstreamService["deleteWorkstream"]>[0]) {
    return this.workstreams.deleteWorkstream(params);
  }

  // Sessions

  async startSession(params: Parameters<SessionService["startSession"]>[0]) {
    return this.sessions.startSession(params);
  }

  async startOrResumeSession(params: Parameters<SessionService["startOrResumeSession"]>[0]) {
    return this.sessions.startOrResumeSession(params);
  }

  async listSessions(params: Parameters<SessionService["listSessions"]>[0]) {
    return this.sessions.listSessions(params);
  }

  async getActiveSession(params: Parameters<SessionService["getActiveSession"]>[0]) {
    return this.sessions.getActiveSession(params);
  }

  async getLatestSession(params: Parameters<SessionService["getLatestSession"]>[0]) {
    return this.sessions.getLatestSession(params);
  }

  async saveCheckpoint(params: Parameters<SessionService["saveCheckpoint"]>[0]) {
    return this.sessions.saveCheckpoint(params);
  }

  async updateSessionGraphVisibility(params: Parameters<SessionService["updateSessionGraphVisibility"]>[0]) {
    return this.sessions.updateSessionGraphVisibility(params);
  }

  async closeSession(params: Parameters<SessionService["closeSession"]>[0]) {
    return this.sessions.closeSession(params);
  }

  async generateSessionSummary(params: Parameters<SessionService["generateSessionSummary"]>[0]) {
    return this.sessions.generateSessionSummary(params);
  }

  async generateSessionSummaries(params: Parameters<SessionService["generateSessionSummaries"]>[0]) {
    return this.sessions.generateSessionSummaries(params);
  }

  async deleteSession(params: Parameters<SessionService["deleteSession"]>[0]) {
    return this.sessions.deleteSession(params);
  }

  // Documents

  async listDocuments(params: Parameters<DocumentService["listDocuments"]>[0]) {
    return this.documents.listDocuments(params);
  }

  async createDocument(params: Parameters<DocumentService["createDocument"]>[0]) {
    return this.documents.createDocument(params);
  }

  async updateDocument(params: Parameters<DocumentService["updateDocument"]>[0]) {
    return this.documents.updateDocument(params);
  }

  async deleteDocument(params: Parameters<DocumentService["deleteDocument"]>[0]) {
    return this.documents.deleteDocument(params);
  }

  // Imports

  listImportProfiles() {
    return this.imports.listImportProfiles();
  }

  async prepareImport(params: Parameters<ImportService["prepareImport"]>[0]) {
    return this.imports.prepareImport(params);
  }

  async commitImport(params: Parameters<ImportService["commitImport"]>[0]) {
    return this.imports.commitImport(params);
  }

  // Context bundles

  async previewContextBundle(params: Parameters<ContextService["previewContextBundle"]>[0]) {
    return this.context.previewContextBundle(params);
  }

  async getContextBundle(params: Parameters<ContextService["getContextBundle"]>[0]) {
    return this.context.getContextBundle(params);
  }

  // Search

  async search(params: Parameters<SearchService["search"]>[0]) {
    return this.searchService.search(params);
  }

  // Memory Inbox

  async proposeMemoryUpdate(params: Parameters<InboxService["proposeMemoryUpdate"]>[0]) {
    return this.inbox.proposeMemoryUpdate(params);
  }

  async proposeGraphUpdate(params: Parameters<InboxService["proposeGraphUpdate"]>[0]) {
    return this.inbox.proposeGraphUpdate(params);
  }

  async listInbox(params: Parameters<InboxService["listInbox"]>[0]) {
    return this.inbox.listInbox(params);
  }

  async updateInboxStatus(params: Parameters<InboxService["updateInboxStatus"]>[0]) {
    return this.inbox.updateInboxStatus(params);
  }

  async deleteInboxItem(params: Parameters<InboxService["deleteInboxItem"]>[0]) {
    return this.inbox.deleteInboxItem(params);
  }

  // Graph

  async getGraph(params: Parameters<GraphService["getGraph"]>[0]) {
    return this.graph.getGraph(params);
  }

  // Semantic graph

  async getSemanticGraphSettings(params: Parameters<SemanticGraphService["getSettings"]>[0]) {
    return this.semanticGraph.getSettings(params);
  }

  async updateSemanticGraphSettings(params: Parameters<SemanticGraphService["updateSettings"]>[0]) {
    return this.semanticGraph.updateSettings(params);
  }

  async getSemanticGraphStatus(params: Parameters<SemanticGraphService["getStatus"]>[0]) {
    return this.semanticGraph.getStatus(params);
  }

  async listSemanticEdges(params: Parameters<SemanticGraphService["listEdges"]>[0]) {
    return this.semanticGraph.listEdges(params);
  }

  async updateSemanticEdgeStatus(params: Parameters<SemanticGraphService["updateEdgeStatus"]>[0]) {
    return this.semanticGraph.updateEdgeStatus(params);
  }

  async listSemanticGraphRuns(params: Parameters<SemanticGraphService["listRuns"]>[0]) {
    return this.semanticGraph.listRuns(params);
  }

  async getSemanticGraphRun(params: Parameters<SemanticGraphService["getRun"]>[0]) {
    return this.semanticGraph.getRun(params);
  }

  async previewSemanticGraphAnalysis(params: Parameters<SemanticGraphService["previewAnalysis"]>[0]) {
    return this.semanticGraph.previewAnalysis(params);
  }

  async analyzeSemanticGraph(params: Parameters<SemanticGraphService["analyze"]>[0]) {
    return this.semanticGraph.analyze(params);
  }

  async checkSemanticGraphProvider(params: Parameters<SemanticGraphService["checkProvider"]>[0]) {
    return this.semanticGraph.checkProvider(params);
  }

  async proposeSemanticEdges(params: Parameters<SemanticGraphService["proposeEdges"]>[0]) {
    return this.semanticGraph.proposeEdges(params);
  }

  async acceptSemanticEdgesProposal(params: Parameters<SemanticGraphService["acceptProposal"]>[0]) {
    return this.semanticGraph.acceptProposal(params);
  }

  // Backups

  async backupProject(params: Parameters<BackupService["backupProject"]>[0]) {
    return this.backups.backupProject(params);
  }

  async listBackups(params: Parameters<BackupService["listBackups"]>[0]) {
    return this.backups.listBackups(params);
  }

  async deleteBackup(params: Parameters<BackupService["deleteBackup"]>[0]) {
    return this.backups.deleteBackup(params);
  }

  // Trash

  async listTrash() {
    return this.trash.listTrash();
  }

  async restoreTrashItem(params: Parameters<TrashService["restoreTrashItem"]>[0]) {
    return this.trash.restoreTrashItem(params);
  }

  async purgeTrashItem(params: Parameters<TrashService["purgeTrashItem"]>[0]) {
    return this.trash.purgeTrashItem(params);
  }

  async emptyTrash(params: Parameters<TrashService["emptyTrash"]>[0]) {
    return this.trash.emptyTrash(params);
  }

  // Assistant

  async assistantStatus(params: Parameters<AssistantService["assistantStatus"]>[0]) {
    return this.assistant.assistantStatus(params);
  }

  async summarizeSession(params: Parameters<AssistantService["summarizeSession"]>[0]) {
    return this.assistant.summarizeSession(params);
  }

  async prepareReturnSummary(params: Parameters<AssistantService["prepareReturnSummary"]>[0]) {
    return this.assistant.prepareReturnSummary(params);
  }

  async classifyDocument(params: Parameters<AssistantService["classifyDocument"]>[0]) {
    return this.assistant.classifyDocument(params);
  }

  memoryRoot(): string {
    return this.registry.memoryRoot;
  }
}
