import {
  operationRegistryManifest,
  type OperationName
} from "@zharwing/memory-core";
import { doctorMcpSetup, installMcpAuto, installMcpClient } from "@zharwing/memory-mcp";
import type { MemoryService } from "../memory-service.js";
import { requireParams } from "../rpc-params.js";

export type OperationHandler = (
  service: MemoryService,
  input: Record<string, unknown>
) => Promise<unknown> | unknown;

/**
 * The daemon's dispatch vocabulary is derived from the core registry once at
 * composition time. Aliases are explicit here because they are compatibility
 * names, not alternate service owners.
 */
export function createOperationHandlerRegistry(): ReadonlyMap<OperationName, OperationHandler> {
  const handlers = new Map<OperationName, OperationHandler>();
  for (const definition of operationRegistryManifest()) {
    handlers.set(definition.name, handlerFor(definition.name));
  }
  return handlers;
}

function handlerFor(name: OperationName): OperationHandler {
  if (name === "memory.health") return (service) => ({ status: "ok", memoryRoot: service.memoryRoot() });
  if (name === "memory.mcp_doctor") return (service, input) => doctorMcpSetup(requireParams(input, name));
  if (name === "memory.mcp_install") return (_service, input) => input.client === "auto"
    ? installMcpAuto(requireParams(input, name))
    : installMcpClient(requireParams(input, name));
  if (name === "memory.get_project") return (service, input) =>
    service.getProject(String(requireParams<{ projectId: unknown }>(input, name).projectId));

  const aliases: Partial<Record<OperationName, string>> = {
    "memory.get_recent_sessions": "listSessions",
    "memory.list_project_sessions": "listSessions",
    "memory.list_docs": "listDocuments",
    "memory.import_doc": "createDocument",
    "memory.create_doc": "createDocument",
    "memory.update_doc": "updateDocument",
    "memory.delete_doc": "deleteDocument",
    "memory.classify_imported_doc": "classifyDocument",
    "memory.get_semantic_graph_settings": "getSemanticGraphSettings",
    "memory.update_semantic_graph_settings": "updateSemanticGraphSettings",
    "memory.get_semantic_graph_status": "getSemanticGraphStatus",
    "memory.list_semantic_edges": "listSemanticEdges",
    "memory.update_semantic_edge_status": "updateSemanticEdgeStatus",
    "memory.list_semantic_graph_runs": "listSemanticGraphRuns",
    "memory.get_semantic_graph_run": "getSemanticGraphRun",
    "memory.preview_semantic_graph_analysis": "previewSemanticGraphAnalysis",
    "memory.analyze_semantic_graph": "analyzeSemanticGraph",
    "memory.check_semantic_graph_provider": "checkSemanticGraphProvider",
    "memory.propose_semantic_edges": "proposeSemanticEdges",
    "memory.accept_semantic_edges_proposal": "acceptSemanticEdgesProposal",
    "memory.update_memory_write_policy": "updateMemoryWritePolicy",
    "memory.update_assistant_policy": "updateAssistantPolicy",
    "memory.get_provider_secret_status": "getProviderSecretStatus",
    "memory.set_provider_secret": "setProviderSecret",
    "memory.rotate_provider_secret": "rotateProviderSecret",
    "memory.clear_provider_secret": "clearProviderSecret",
    "memory.get_startup_state": "getStartupState",
    "memory.prepare_project_creation": "prepareProjectCreation",
    "memory.create_project": "createProject",
    "memory.delete_project": "deleteProject",
    "memory.get_project_summary": "getProjectSummary",
    "memory.update_graph_rules": "updateGraphRules",
    "memory.ensure_project": "ensureProject",
    "memory.list_project_repos": "listProjectRepos",
    "memory.link_repo": "linkRepo",
    "memory.unlink_repo": "unlinkRepo",
    "memory.delete_repo": "deleteRepo",
    "memory.list_workstreams": "listWorkstreams",
    "memory.create_workstream": "createWorkstream",
    "memory.get_workstream_detail": "getWorkstreamDetail",
    "memory.update_workstream_status": "updateWorkstreamStatus",
    "memory.delete_workstream": "deleteWorkstream",
    "memory.start_session": "startSession",
    "memory.start_or_resume_session": "startOrResumeSession",
    "memory.get_active_session": "getActiveSession",
    "memory.get_latest_session": "getLatestSession",
    "memory.get_session_detail": "getSessionDetail",
    "memory.preview_context_bundle": "previewContextBundle",
    "memory.get_context_bundle": "getContextBundle",
    "memory.save_checkpoint": "saveCheckpoint",
    "memory.update_session_graph_visibility": "updateSessionGraphVisibility",
    "memory.close_session": "closeSession",
    "memory.close_stale_sessions": "closeStaleSessions",
    "memory.generate_session_summary": "generateSessionSummary",
    "memory.generate_session_summaries": "generateSessionSummaries",
    "memory.delete_session": "deleteSession",
    "memory.search": "search",
    "memory.list_import_profiles": "listImportProfiles",
    "memory.prepare_import": "prepareImport",
    "memory.commit_import": "commitImport",
    "memory.propose_memory_update": "proposeMemoryUpdate",
    "memory.propose_graph_update": "proposeGraphUpdate",
    "memory.list_inbox": "listInbox",
    "memory.update_inbox_status": "updateInboxStatus",
    "memory.delete_inbox_item": "deleteInboxItem",
    "memory.get_graph": "getGraph",
    "memory.backup_project": "backupProject",
    "memory.list_backups": "listBackups",
    "memory.delete_backup": "deleteBackup",
    "memory.list_trash": "listTrash",
    "memory.restore_trash_item": "restoreTrashItem",
    "memory.purge_trash_item": "purgeTrashItem",
    "memory.empty_trash": "emptyTrash",
    "memory.validate_project": "validateProject",
    "memory.rebuild_index": "rebuildIndex",
    "memory.assistant_status": "assistantStatus",
    "memory.summarize_session": "summarizeSession",
    "memory.prepare_return_summary": "prepareReturnSummary",
    "memory.export_project_manifest": "exportProjectManifest"
  };
  const methodName = aliases[name] ?? camelOperationName(name);
  return (service, input) => {
    const candidate = (service as unknown as Record<string, unknown>)[methodName];
    if (typeof candidate !== "function") throw new Error(`No handler for registered operation ${name}.`);
    return (candidate as (params: Record<string, unknown>) => Promise<unknown> | unknown).call(service, requireParams(input, name));
  };
}

function camelOperationName(name: string): string {
  return name.replace(/^memory\./, "").replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}
