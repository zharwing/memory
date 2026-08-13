import type { OperationOutput } from "@zharwing/memory-core";

export type SemanticStatus = OperationOutput<"memory.get_semantic_graph_status">;
export type SemanticPreview = OperationOutput<"memory.preview_semantic_graph_analysis">;
export type SemanticAnalysisResult = OperationOutput<"memory.analyze_semantic_graph">;

export interface SemanticSettingsStatusSnapshot {
  readonly settings: OperationOutput<"memory.get_semantic_graph_settings">;
  readonly status: SemanticStatus;
}

export interface SemanticFullSnapshot extends SemanticSettingsStatusSnapshot {
  readonly edges: OperationOutput<"memory.list_semantic_edges">;
  readonly runs: OperationOutput<"memory.list_semantic_graph_runs">;
}

export interface SemanticProgressSnapshot {
  readonly status: SemanticStatus;
  readonly runs: OperationOutput<"memory.list_semantic_graph_runs">;
}

export interface SemanticStatusEdgesSnapshot {
  readonly status: SemanticStatus;
  readonly edges: OperationOutput<"memory.list_semantic_edges">;
}

export interface SemanticAuthoritativeSnapshot extends SemanticProgressSnapshot {
  readonly edges: OperationOutput<"memory.list_semantic_edges">;
  readonly inbox: OperationOutput<"memory.list_inbox">;
  readonly graph: OperationOutput<"memory.get_graph">;
}

export type SemanticPollResult = "active" | "terminal" | "failure" | "superseded";
