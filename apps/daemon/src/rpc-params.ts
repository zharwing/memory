import { MEMORY_TOOLS } from "@zharwing/memory-mcp";
import { assertSupportedSchema, validateValue, type SchemaNode } from "./schema-validate.js";

// Runtime parameter validation for the RPC boundary (M3). Every method's
// required-parameter set is declared here; requireParams enforces it before
// the params reach a typed service method, replacing unchecked `as never`
// boundary casts. Agent-exposed methods additionally get full JSON-Schema
// validation (types, enums, bounds) from the MCP tool definitions;
// control-plane-only methods are declared alongside with presence checks.

/**
 * Full input schemas for agent-exposed methods, keyed by RPC method and
 * checked for validator support at module load so a future schema keyword
 * the validator does not implement fails every test run loudly instead of
 * silently going unvalidated.
 */
const METHOD_SCHEMAS: Record<string, SchemaNode> = Object.fromEntries(
  MEMORY_TOOLS.map((tool) => {
    assertSupportedSchema(tool.inputSchema as unknown as Record<string, unknown>, tool.rpcMethod);
    return [tool.rpcMethod, tool.inputSchema as unknown as SchemaNode];
  })
);

/**
 * Required-param sets for agent-exposed methods, derived at module load from
 * the MCP tool schemas so the daemon boundary and the advertised tool
 * contracts cannot drift apart.
 */
const AGENT_TOOL_PARAMS: Record<string, readonly string[]> = Object.fromEntries(
  MEMORY_TOOLS.map((tool) => [tool.rpcMethod, tool.inputSchema.required ?? []])
);

/** Control-plane methods with no MCP tool keep hand-declared required sets. */
const CONTROL_PLANE_PARAMS: Record<string, readonly string[]> = {
  "memory.accept_semantic_edges_proposal": ["projectId", "proposalId"],
  "memory.analyze_semantic_graph": ["projectId"],
  "memory.assistant_status": ["projectId"],
  "memory.backup_project": ["projectId"],
  "memory.check_semantic_graph_provider": ["projectId"],
  "memory.classify_imported_doc": ["projectId", "documentId"],
  "memory.close_stale_sessions": ["projectId"],
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
  "memory.get_graph": ["projectId"],
  "memory.get_project": ["projectId"],
  "memory.get_project_summary": ["projectId"],
  "memory.get_semantic_graph_run": ["projectId", "runId"],
  "memory.get_semantic_graph_settings": ["projectId"],
  "memory.get_semantic_graph_status": ["projectId"],
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
  "memory.preview_semantic_graph_analysis": ["projectId"],
  "memory.propose_graph_update": ["projectId", "proposedPatch", "reason"],
  "memory.propose_memory_update": ["projectId", "type", "sourceKind", "proposedPatch", "reason"],
  "memory.propose_semantic_edges": ["projectId", "edges"],
  "memory.purge_trash_item": ["trashItemId"],
  "memory.rebuild_index": ["projectId"],
  "memory.restore_trash_item": ["trashItemId"],
  "memory.start_or_resume_session": ["projectId"],
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

export const REQUIRED_PARAMS: Record<string, readonly string[]> = {
  ...CONTROL_PLANE_PARAMS,
  ...AGENT_TOOL_PARAMS
};

export class RpcValidationError extends Error {}

/**
 * Validate that params is an object carrying every required key for the
 * method and, for agent-exposed methods, that every provided value conforms
 * to the MCP tool's input schema (types, enums, bounds). The single `as T`
 * here is a validated coercion, not the unchecked boundary cast this
 * replaces. REQUIRED_PARAMS and the schemas agree by construction for tool
 * methods (the former is derived from the latter); the presence check runs
 * first so missing-key errors keep their established message shape.
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
  const schema = METHOD_SCHEMAS[method];
  if (schema !== undefined) {
    const errors = validateValue(params, schema, "params");
    if (errors.length > 0) {
      throw new RpcValidationError(`Invalid params for ${method}: ${errors.join("; ")}`);
    }
  }
  return params as T;
}
