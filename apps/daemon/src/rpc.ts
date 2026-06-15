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
    case "memory.get_project_summary":
      return service.getProjectSummary(params as never);
    case "memory.ensure_project":
      return service.ensureProject(params as never);
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
    case "memory.search":
      return service.search(params as never);
    case "memory.list_docs":
      return service.listDocuments(params as never);
    case "memory.import_doc":
    case "memory.create_doc":
      return service.createDocument(params as never);
    case "memory.propose_memory_update":
      return service.proposeMemoryUpdate(params as never);
    case "memory.list_inbox":
      return service.listInbox(params as never);
    case "memory.update_inbox_status":
      return service.updateInboxStatus(params as never);
    case "memory.get_graph":
      return service.getGraph(params as never);
    case "memory.backup_project":
      return service.backupProject(params as never);
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
