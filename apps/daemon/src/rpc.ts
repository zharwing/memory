import { rpcError, rpcOk, type RpcRequest, type RpcResponse } from "@zharwing/memory-core";
import type { MemoryService } from "./memory-service.js";
import { requireParams, RpcValidationError } from "./rpc-params.js";
import { doctorMcpSetup, installMcpAuto, installMcpClient } from "@zharwing/memory-mcp";

export type { RpcRequest, RpcResponse } from "@zharwing/memory-core";

export async function dispatchRpc(service: MemoryService, request: RpcRequest): Promise<RpcResponse> {
  try {
    const result = await callMethod(service, request.method, request.params || {});
    return rpcOk(request.id, result);
  } catch (error) {
    return rpcError(
      request.id,
      error instanceof Error ? error.message : String(error),
      // Validation failures are client errors, not internal faults: no stack.
      error instanceof RpcValidationError ? undefined : (error instanceof Error ? error.stack : undefined)
    );
  }
}

async function callMethod(service: MemoryService, method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case "memory.health":
      return { status: "ok", memoryRoot: service.memoryRoot() };
    case "memory.mcp_doctor":
      return doctorMcpSetup(requireParams(params, method));
    case "memory.mcp_install":
      if (params.client === "auto") return installMcpAuto(requireParams(params, method));
      return installMcpClient(requireParams(params, method));
    case "memory.list_projects":
      return service.listProjects();
    case "memory.get_project":
      return service.getProject(String(requireParams<{ projectId: unknown }>(params, method).projectId));
    case "memory.detect_project":
      return service.detectProject({ workingDirectory: String(params.workingDirectory || process.cwd()) });
    case "memory.get_startup_state":
      return service.getStartupState(requireParams(params, method));
    case "memory.prepare_project_creation":
      return service.prepareProjectCreation(requireParams(params, method));
    case "memory.create_project":
      return service.createProject(requireParams(params, method));
    case "memory.delete_project":
      return service.deleteProject(requireParams(params, method));
    case "memory.get_project_summary":
      return service.getProjectSummary(requireParams(params, method));
    case "memory.update_memory_write_policy":
      return service.updateMemoryWritePolicy(requireParams(params, method));
    case "memory.update_assistant_policy":
      return service.updateAssistantPolicy(requireParams(params, method));
    case "memory.update_graph_rules":
      return service.updateGraphRules(requireParams(params, method));
    case "memory.ensure_project":
      return service.ensureProject(requireParams(params, method));
    case "memory.list_project_repos":
      return service.listProjectRepos(requireParams(params, method));
    case "memory.link_repo":
      return service.linkRepo(requireParams(params, method));
    case "memory.unlink_repo":
      return service.unlinkRepo(requireParams(params, method));
    case "memory.delete_repo":
      return service.deleteRepo(requireParams(params, method));
    case "memory.list_workstreams":
      return service.listWorkstreams(requireParams(params, method));
    case "memory.create_workstream":
      return service.createWorkstream(requireParams(params, method));
    case "memory.get_workstream_detail":
      return service.getWorkstreamDetail(requireParams(params, method));
    case "memory.update_workstream_status":
      return service.updateWorkstreamStatus(requireParams(params, method));
    case "memory.delete_workstream":
      return service.deleteWorkstream(requireParams(params, method));
    case "memory.start_session":
      return service.startSession(requireParams(params, method));
    case "memory.start_or_resume_session":
      return service.startOrResumeSession(requireParams(params, method));
    case "memory.get_active_session":
      return service.getActiveSession(requireParams(params, method));
    case "memory.get_latest_session":
      return service.getLatestSession(requireParams(params, method));
    case "memory.get_session_detail":
      return service.getSessionDetail(requireParams(params, method));
    case "memory.get_recent_sessions":
    case "memory.list_project_sessions":
      return service.listSessions(requireParams(params, method));
    case "memory.preview_context_bundle":
      return service.previewContextBundle(requireParams(params, method));
    case "memory.get_context_bundle":
      return service.getContextBundle(requireParams(params, method));
    case "memory.save_checkpoint":
      return service.saveCheckpoint(requireParams(params, method));
    case "memory.update_session_graph_visibility":
      return service.updateSessionGraphVisibility(requireParams(params, method));
    case "memory.close_session":
      return service.closeSession(requireParams(params, method));
    case "memory.close_stale_sessions":
      return service.closeStaleSessions(requireParams(params, method));
    case "memory.generate_session_summary":
      return service.generateSessionSummary(requireParams(params, method));
    case "memory.generate_session_summaries":
      return service.generateSessionSummaries(requireParams(params, method));
    case "memory.delete_session":
      return service.deleteSession(requireParams(params, method));
    case "memory.search":
      return service.search(requireParams(params, method));
    case "memory.list_docs":
      return service.listDocuments(requireParams(params, method));
    case "memory.import_doc":
    case "memory.create_doc":
      return service.createDocument(requireParams(params, method));
    case "memory.update_doc":
      return service.updateDocument(requireParams(params, method));
    case "memory.delete_doc":
      return service.deleteDocument(requireParams(params, method));
    case "memory.list_import_profiles":
      return service.listImportProfiles();
    case "memory.prepare_import":
      return service.prepareImport(requireParams(params, method));
    case "memory.commit_import":
      return service.commitImport(requireParams(params, method));
    case "memory.propose_memory_update":
      return service.proposeMemoryUpdate(requireParams(params, method));
    case "memory.propose_graph_update":
      return service.proposeGraphUpdate(requireParams(params, method));
    case "memory.list_inbox":
      return service.listInbox(requireParams(params, method));
    case "memory.update_inbox_status":
      return service.updateInboxStatus(requireParams(params, method));
    case "memory.delete_inbox_item":
      return service.deleteInboxItem(requireParams(params, method));
    case "memory.get_graph":
      return service.getGraph(requireParams(params, method));
    case "memory.get_semantic_graph_settings":
      return service.getSemanticGraphSettings(requireParams(params, method));
    case "memory.update_semantic_graph_settings":
      return service.updateSemanticGraphSettings(requireParams(params, method));
    case "memory.get_semantic_graph_status":
      return service.getSemanticGraphStatus(requireParams(params, method));
    case "memory.list_semantic_edges":
      return service.listSemanticEdges(requireParams(params, method));
    case "memory.update_semantic_edge_status":
      return service.updateSemanticEdgeStatus(requireParams(params, method));
    case "memory.list_semantic_graph_runs":
      return service.listSemanticGraphRuns(requireParams(params, method));
    case "memory.get_semantic_graph_run":
      return service.getSemanticGraphRun(requireParams(params, method));
    case "memory.preview_semantic_graph_analysis":
      return service.previewSemanticGraphAnalysis(requireParams(params, method));
    case "memory.analyze_semantic_graph":
      return service.analyzeSemanticGraph(requireParams(params, method));
    case "memory.check_semantic_graph_provider":
      return service.checkSemanticGraphProvider(requireParams(params, method));
    case "memory.propose_semantic_edges":
      return service.proposeSemanticEdges(requireParams(params, method));
    case "memory.accept_semantic_edges_proposal":
      return service.acceptSemanticEdgesProposal(requireParams(params, method));
    case "memory.backup_project":
      return service.backupProject(requireParams(params, method));
    case "memory.list_backups":
      return service.listBackups(requireParams(params, method));
    case "memory.delete_backup":
      return service.deleteBackup(requireParams(params, method));
    case "memory.list_trash":
      return service.listTrash();
    case "memory.restore_trash_item":
      return service.restoreTrashItem(requireParams(params, method));
    case "memory.purge_trash_item":
      return service.purgeTrashItem(requireParams(params, method));
    case "memory.empty_trash":
      return service.emptyTrash(requireParams(params, method));
    case "memory.validate_project":
      return service.validateProject(requireParams(params, method));
    case "memory.rebuild_index":
      return service.rebuildIndex(requireParams(params, method));
    case "memory.assistant_status":
      return service.assistantStatus(requireParams(params, method));
    case "memory.summarize_session":
      return service.summarizeSession(requireParams(params, method));
    case "memory.prepare_return_summary":
      return service.prepareReturnSummary(requireParams(params, method));
    case "memory.classify_imported_doc":
      return service.classifyDocument(requireParams(params, method));
    case "memory.export_project_manifest":
      return service.exportProjectManifest(requireParams(params, method));
    default:
      throw new Error(`Unknown RPC method: ${method}`);
  }
}
