import type { MemoryClient } from "@zharwing/memory-api-client";
import type { OperationName } from "@zharwing/memory-core";
import type {
  DesktopFeaturePorts,
  FeatureClientPort
} from "../../application/ports/features.js";
import type { OperationPortArguments } from "../../application/ports/operation-port.js";

const PROJECT_OPERATIONS = [
  "memory.prepare_destructive_intent", "memory.commit_destructive_intent", "memory.create_project",
  "memory.delete_project", "memory.delete_repo", "memory.get_project_summary", "memory.link_repo",
  "memory.list_project_repos", "memory.list_projects", "memory.prepare_project_creation",
  "memory.unlink_repo", "memory.update_memory_write_policy"
] as const;
const DOC_OPERATIONS = [
  "memory.prepare_destructive_intent", "memory.commit_destructive_intent", "memory.delete_doc",
  "memory.list_docs", "memory.search", "memory.update_doc"
] as const;
const SESSION_OPERATIONS = [
  "memory.prepare_destructive_intent", "memory.commit_destructive_intent", "memory.close_session",
  "memory.close_stale_sessions", "memory.delete_session", "memory.generate_session_summaries",
  "memory.generate_session_summary", "memory.get_session_detail", "memory.list_project_sessions",
  "memory.save_checkpoint", "memory.start_session", "memory.update_session_graph_visibility"
] as const;
const WORKSTREAM_OPERATIONS = [
  "memory.prepare_destructive_intent", "memory.commit_destructive_intent", "memory.create_workstream",
  "memory.delete_workstream", "memory.get_workstream_detail", "memory.list_workstreams",
  "memory.update_workstream_status"
] as const;
const GRAPH_OPERATIONS = ["memory.get_graph", "memory.update_graph_rules", "memory.update_inbox_status"] as const;
const INBOX_OPERATIONS = [
  "memory.prepare_destructive_intent", "memory.commit_destructive_intent", "memory.delete_inbox_item",
  "memory.list_inbox", "memory.update_inbox_status"
] as const;
const ASSISTANT_OPERATIONS = [
  "memory.assistant_status", "memory.check_semantic_graph_provider", "memory.clear_provider_secret",
  "memory.get_provider_secret_status", "memory.preview_context_bundle", "memory.rotate_provider_secret",
  "memory.set_provider_secret", "memory.update_assistant_policy"
] as const;
const SEMANTIC_OPERATIONS = [
  "memory.accept_semantic_edges_proposal", "memory.analyze_semantic_graph", "memory.get_graph",
  "memory.get_semantic_graph_settings", "memory.get_semantic_graph_status", "memory.list_inbox",
  "memory.list_semantic_edges", "memory.list_semantic_graph_runs", "memory.preview_semantic_graph_analysis",
  "memory.update_semantic_edge_status", "memory.update_semantic_graph_settings"
] as const;
const SYSTEM_OPERATIONS = [
  "memory.prepare_destructive_intent", "memory.commit_destructive_intent", "memory.backup_project",
  "memory.delete_backup", "memory.empty_trash", "memory.health", "memory.list_backups",
  "memory.list_import_profiles", "memory.list_trash", "memory.mcp_doctor", "memory.mcp_install",
  "memory.commit_import", "memory.prepare_import", "memory.purge_trash_item", "memory.restore_trash_item"
] as const;

export function createDesktopFeaturePorts(memory: MemoryClient): DesktopFeaturePorts {
  return {
    projects: allowOperations(memory, PROJECT_OPERATIONS),
    docs: allowOperations(memory, DOC_OPERATIONS),
    sessions: allowOperations(memory, SESSION_OPERATIONS),
    workstreams: allowOperations(memory, WORKSTREAM_OPERATIONS),
    graph: allowOperations(memory, GRAPH_OPERATIONS),
    semantic: allowOperations(memory, SEMANTIC_OPERATIONS),
    inbox: allowOperations(memory, INBOX_OPERATIONS),
    assistant: allowOperations(memory, ASSISTANT_OPERATIONS),
    system: allowOperations(memory, SYSTEM_OPERATIONS)
  };
}

function allowOperations<Names extends OperationName>(
  memory: MemoryClient,
  names: readonly Names[]
): FeatureClientPort<Names> {
  const allowed = new Set<OperationName>(names);
  return {
    operation<Name extends Names>(name: Name, ...args: OperationPortArguments<Name>) {
      if (!allowed.has(name)) throw new Error(`Feature port does not admit operation ${name}.`);
      return memory.operation(name, ...args);
    }
  };
}
