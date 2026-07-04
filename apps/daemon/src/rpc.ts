import type { MemoryService } from "./memory-service.js";

export interface RpcRequest {
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcResponse {
  id?: string | number;
  ok: boolean;
  result?: unknown;
  error?: {
    message: string;
    stack?: string;
  };
}

export async function dispatchRpc(service: MemoryService, request: RpcRequest): Promise<RpcResponse> {
  try {
    const result = await callMethod(service, request.method, request.params || {});
    return { id: request.id, ok: true, result };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    };
  }
}

async function callMethod(service: MemoryService, method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case "memory.health":
      return { status: "ok", memoryRoot: service.memoryRoot() };
    case "memory.list_projects":
      return service.listProjects();
    case "memory.get_project":
      return service.getProject(String(params.projectId));
    case "memory.detect_project":
      return service.detectProject({ workingDirectory: String(params.workingDirectory || process.cwd()) });
    case "memory.get_startup_state":
      return service.getStartupState(params);
    case "memory.prepare_project_creation":
      return service.prepareProjectCreation(params as never);
    case "memory.create_project":
      return service.createProject(params as never);
    case "memory.delete_project":
      return service.deleteProject(params as never);
    case "memory.get_project_summary":
      return service.getProjectSummary(params as never);
    case "memory.update_memory_write_policy":
      return service.updateMemoryWritePolicy(params as never);
    case "memory.update_graph_rules":
      return service.updateGraphRules(params as never);
    case "memory.ensure_project":
      return service.ensureProject(params as never);
    case "memory.list_project_repos":
      return service.listProjectRepos(params as never);
    case "memory.link_repo":
      return service.linkRepo(params as never);
    case "memory.unlink_repo":
      return service.unlinkRepo(params as never);
    case "memory.delete_repo":
      return service.deleteRepo(params as never);
    case "memory.list_workstreams":
      return service.listWorkstreams(params as never);
    case "memory.create_workstream":
      return service.createWorkstream(params as never);
    case "memory.get_workstream_detail":
      return service.getWorkstreamDetail(params as never);
    case "memory.update_workstream_status":
      return service.updateWorkstreamStatus(params as never);
    case "memory.delete_workstream":
      return service.deleteWorkstream(params as never);
    case "memory.start_session":
      return service.startSession(params as never);
    case "memory.start_or_resume_session":
      return service.startOrResumeSession(params as never);
    case "memory.get_active_session":
      return service.getActiveSession(params as never);
    case "memory.get_latest_session":
      return service.getLatestSession(params as never);
    case "memory.get_recent_sessions":
    case "memory.list_project_sessions":
      return service.listSessions(params as never);
    case "memory.preview_context_bundle":
      return service.previewContextBundle(params as never);
    case "memory.get_context_bundle":
      return service.getContextBundle(params as never);
    case "memory.save_checkpoint":
      return service.saveCheckpoint(params as never);
    case "memory.close_session":
      return service.closeSession(params as never);
    case "memory.delete_session":
      return service.deleteSession(params as never);
    case "memory.search":
      return service.search(params as never);
    case "memory.list_docs":
      return service.listDocuments(params as never);
    case "memory.import_doc":
    case "memory.create_doc":
      return service.createDocument(params as never);
    case "memory.update_doc":
      return service.updateDocument(params as never);
    case "memory.delete_doc":
      return service.deleteDocument(params as never);
    case "memory.list_import_profiles":
      return service.listImportProfiles();
    case "memory.prepare_import":
      return service.prepareImport(params as never);
    case "memory.commit_import":
      return service.commitImport(params as never);
    case "memory.propose_memory_update":
      return service.proposeMemoryUpdate(params as never);
    case "memory.propose_graph_update":
      return service.proposeGraphUpdate(params as never);
    case "memory.list_inbox":
      return service.listInbox(params as never);
    case "memory.update_inbox_status":
      return service.updateInboxStatus(params as never);
    case "memory.delete_inbox_item":
      return service.deleteInboxItem(params as never);
    case "memory.get_graph":
      return service.getGraph(params as never);
    case "memory.get_semantic_graph_settings":
      return service.getSemanticGraphSettings(params as never);
    case "memory.update_semantic_graph_settings":
      return service.updateSemanticGraphSettings(params as never);
    case "memory.get_semantic_graph_status":
      return service.getSemanticGraphStatus(params as never);
    case "memory.list_semantic_edges":
      return service.listSemanticEdges(params as never);
    case "memory.update_semantic_edge_status":
      return service.updateSemanticEdgeStatus(params as never);
    case "memory.list_semantic_graph_runs":
      return service.listSemanticGraphRuns(params as never);
    case "memory.get_semantic_graph_run":
      return service.getSemanticGraphRun(params as never);
    case "memory.preview_semantic_graph_analysis":
      return service.previewSemanticGraphAnalysis(params as never);
    case "memory.analyze_semantic_graph":
      return service.analyzeSemanticGraph(params as never);
    case "memory.check_semantic_graph_provider":
      return service.checkSemanticGraphProvider(params as never);
    case "memory.propose_semantic_edges":
      return service.proposeSemanticEdges(params as never);
    case "memory.accept_semantic_edges_proposal":
      return service.acceptSemanticEdgesProposal(params as never);
    case "memory.backup_project":
      return service.backupProject(params as never);
    case "memory.list_backups":
      return service.listBackups(params as never);
    case "memory.delete_backup":
      return service.deleteBackup(params as never);
    case "memory.list_trash":
      return service.listTrash();
    case "memory.restore_trash_item":
      return service.restoreTrashItem(params as never);
    case "memory.purge_trash_item":
      return service.purgeTrashItem(params as never);
    case "memory.empty_trash":
      return service.emptyTrash(params as never);
    case "memory.validate_project":
      return service.validateProject(params as never);
    case "memory.rebuild_index":
      return service.rebuildIndex(params as never);
    case "memory.assistant_status":
      return service.assistantStatus(params as never);
    case "memory.summarize_session":
      return service.summarizeSession(params as never);
    case "memory.prepare_return_summary":
      return service.prepareReturnSummary(params as never);
    case "memory.classify_imported_doc":
      return service.classifyDocument(params as never);
    case "memory.export_project_manifest":
      return service.exportProjectManifest(params as never);
    default:
      throw new Error(`Unknown RPC method: ${method}`);
  }
}
