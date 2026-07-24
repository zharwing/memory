// Runtime parameter validation for the RPC boundary (M3). Every method's
// required-parameter set is declared here; requireParams enforces it before
// the params reach a typed service method, replacing unchecked `as never`
// boundary casts. Agent-exposed methods derive their required sets from the
// MCP tool definitions; control-plane-only methods are declared alongside.
export const REQUIRED_PARAMS: Record<string, readonly string[]> = {
  "memory.accept_semantic_edges_proposal": ["projectId", "proposalId"],
  "memory.analyze_semantic_graph": ["projectId"],
  "memory.assistant_status": ["projectId"],
  "memory.backup_project": ["projectId"],
  "memory.check_semantic_graph_provider": ["projectId"],
  "memory.classify_imported_doc": ["projectId", "documentId"],
  "memory.close_session": ["projectId", "sessionId"],
  "memory.commit_import": ["projectId"],
  "memory.create_doc": ["projectId", "title", "type", "body"],
  "memory.create_project": ["preview"],
  "memory.create_workstream": ["projectId", "name"],
  "memory.delete_backup": ["projectId", "snapshotPath"],
  "memory.delete_doc": ["projectId", "documentId"],
  "memory.delete_inbox_item": ["projectId", "proposalId"],
  "memory.delete_project": ["projectId"],
  "memory.delete_repo": ["projectId", "repoPath"],
  "memory.delete_session": ["projectId", "sessionId"],
  "memory.delete_workstream": ["projectId", "workstreamId"],
  "memory.detect_project": ["workingDirectory"],
  "memory.empty_trash": [],
  "memory.ensure_project": ["projectId"],
  "memory.export_project_manifest": ["projectId"],
  "memory.generate_session_summaries": ["projectId"],
  "memory.generate_session_summary": ["projectId", "sessionId"],
  "memory.get_active_session": ["projectId"],
  "memory.get_context_bundle": ["projectId"],
  "memory.get_graph": ["projectId"],
  "memory.get_latest_session": ["projectId"],
  "memory.get_project": ["projectId"],
  "memory.get_project_summary": ["projectId"],
  "memory.get_recent_sessions": ["projectId"],
  "memory.get_semantic_graph_run": ["projectId", "runId"],
  "memory.get_semantic_graph_settings": ["projectId"],
  "memory.get_semantic_graph_status": ["projectId"],
  "memory.get_startup_state": [],
  "memory.get_workstream_detail": ["projectId", "workstreamId"],
  "memory.import_doc": ["projectId"],
  "memory.link_repo": ["projectId", "repoPath"],
  "memory.list_backups": ["projectId"],
  "memory.list_docs": ["projectId"],
  "memory.list_import_profiles": [],
  "memory.list_inbox": ["projectId"],
  "memory.list_project_repos": ["projectId"],
  "memory.list_project_sessions": ["projectId"],
  "memory.list_projects": [],
  "memory.list_semantic_edges": ["projectId"],
  "memory.list_semantic_graph_runs": ["projectId"],
  "memory.list_trash": [],
  "memory.list_workstreams": ["projectId"],
  "memory.mcp_doctor": [],
  "memory.mcp_install": [],
  "memory.prepare_import": ["projectId", "sourceRoot"],
  "memory.prepare_project_creation": ["workingDirectory"],
  "memory.prepare_return_summary": ["projectId"],
  "memory.preview_context_bundle": ["projectId"],
  "memory.preview_semantic_graph_analysis": ["projectId"],
  "memory.propose_graph_update": ["projectId", "proposedPatch", "reason"],
  "memory.propose_memory_update": ["projectId", "type", "sourceKind", "proposedPatch", "reason"],
  "memory.propose_semantic_edges": ["projectId", "edges"],
  "memory.purge_trash_item": ["trashItemId"],
  "memory.rebuild_index": ["projectId"],
  "memory.restore_trash_item": ["trashItemId"],
  "memory.save_checkpoint": ["projectId", "sessionId", "summary"],
  "memory.search": ["projectId", "query"],
  "memory.start_or_resume_session": ["projectId"],
  "memory.start_session": ["projectId"],
  "memory.summarize_session": ["projectId", "sessionId"],
  "memory.unlink_repo": ["projectId", "repoPath"],
  "memory.update_assistant_policy": ["projectId"],
  "memory.update_doc": ["projectId", "documentId"],
  "memory.update_graph_rules": ["projectId", "graphRules"],
  "memory.update_inbox_status": ["projectId", "proposalId", "status"],
  "memory.update_memory_write_policy": ["projectId"],
  "memory.update_semantic_edge_status": ["projectId", "edgeIds", "status"],
  "memory.update_semantic_graph_settings": ["projectId", "settings"],
  "memory.update_session_graph_visibility": ["projectId", "sessionId", "includeInGraph"],
  "memory.update_workstream_status": ["projectId", "workstreamId", "status"],
  "memory.validate_project": ["projectId"],
};

export class RpcValidationError extends Error {}

/**
 * Validate that params is an object carrying every required key for the
 * method, then return it typed to the call site's expected parameter type.
 * The single `as T` here is a validated coercion, not the unchecked
 * boundary cast this replaces.
 */
export function requireParams<T>(params: Record<string, unknown>, method: string): T {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new RpcValidationError(`RPC params for ${method} must be an object.`);
  }
  const required = REQUIRED_PARAMS[method] ?? [];
  const missing = required.filter((key) => params[key] === undefined || params[key] === null);
  if (missing.length > 0) {
    throw new RpcValidationError(`Missing required params for ${method}: ${missing.join(", ")}`);
  }
  return params as T;
}
