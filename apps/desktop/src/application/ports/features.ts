import type { OperationName } from "@zharwing/memory-core";
import type { OperationPort } from "./operation-port.js";

export type FeatureClientPort<Names extends OperationName> = OperationPort<Names>;
export type ProjectsClientPort = FeatureClientPort<
  "memory.prepare_destructive_intent" | "memory.commit_destructive_intent" | "memory.create_project" | "memory.delete_project" | "memory.delete_repo" | "memory.get_project_summary" |
  "memory.link_repo" | "memory.list_project_repos" | "memory.list_projects" | "memory.prepare_project_creation" |
  "memory.unlink_repo" | "memory.update_memory_write_policy"
>;
export type DocsClientPort = FeatureClientPort<"memory.prepare_destructive_intent" | "memory.commit_destructive_intent" | "memory.delete_doc" | "memory.list_docs" | "memory.search" | "memory.update_doc">;
export type SessionsClientPort = FeatureClientPort<
  "memory.prepare_destructive_intent" | "memory.commit_destructive_intent" |
  "memory.close_session" | "memory.close_stale_sessions" | "memory.delete_session" | "memory.generate_session_summaries" |
  "memory.generate_session_summary" | "memory.get_session_detail" | "memory.list_project_sessions" | "memory.save_checkpoint" |
  "memory.start_session" | "memory.update_session_graph_visibility"
>;
export type WorkstreamsClientPort = FeatureClientPort<"memory.prepare_destructive_intent" | "memory.commit_destructive_intent" | "memory.create_workstream" | "memory.delete_workstream" | "memory.get_workstream_detail" | "memory.list_workstreams" | "memory.update_workstream_status">;
export type GraphClientPort = FeatureClientPort<"memory.get_graph" | "memory.update_graph_rules" | "memory.update_inbox_status">;
export type InboxClientPort = FeatureClientPort<"memory.prepare_destructive_intent" | "memory.commit_destructive_intent" | "memory.delete_inbox_item" | "memory.list_inbox" | "memory.update_inbox_status">;
export type AssistantClientPort = FeatureClientPort<"memory.assistant_status" | "memory.check_semantic_graph_provider" | "memory.clear_provider_secret" | "memory.get_provider_secret_status" | "memory.preview_context_bundle" | "memory.rotate_provider_secret" | "memory.set_provider_secret" | "memory.update_assistant_policy">;
export type SemanticClientPort = FeatureClientPort<
  "memory.accept_semantic_edges_proposal" | "memory.analyze_semantic_graph" | "memory.get_graph" | "memory.get_semantic_graph_settings" |
  "memory.get_semantic_graph_status" | "memory.list_inbox" | "memory.list_semantic_edges" | "memory.list_semantic_graph_runs" |
  "memory.preview_semantic_graph_analysis" | "memory.update_semantic_edge_status" | "memory.update_semantic_graph_settings"
>;
export type SystemClientPort = FeatureClientPort<
  "memory.prepare_destructive_intent" | "memory.commit_destructive_intent" |
  "memory.backup_project" | "memory.delete_backup" | "memory.empty_trash" | "memory.health" | "memory.list_backups" |
  "memory.list_import_profiles" | "memory.list_trash" | "memory.mcp_doctor" | "memory.mcp_install" | "memory.commit_import" |
  "memory.prepare_import" | "memory.purge_trash_item" | "memory.restore_trash_item"
>;

/** The complete feature-facing transport graph, composed exactly once. */
export interface DesktopFeaturePorts {
  readonly projects: ProjectsClientPort;
  readonly docs: DocsClientPort;
  readonly sessions: SessionsClientPort;
  readonly workstreams: WorkstreamsClientPort;
  readonly graph: GraphClientPort;
  readonly semantic: SemanticClientPort;
  readonly inbox: InboxClientPort;
  readonly assistant: AssistantClientPort;
  readonly system: SystemClientPort;
}
