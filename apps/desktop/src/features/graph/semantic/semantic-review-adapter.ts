import type { SemanticGraphScope } from "@zharwing/memory-core";

export function semanticScopeKey(scope: SemanticGraphScope): string {
  if (scope.kind === "focused-graph-node") return `${scope.kind}:${scope.nodeId ?? ""}`;
  if (scope.kind === "selected-docs") return `${scope.kind}:${(scope.documentIds ?? []).join(",")}`;
  if (scope.kind === "workstream") return `${scope.kind}:${scope.workstreamId ?? ""}`;
  if (scope.kind === "repo") return `${scope.kind}:${scope.repoPath ?? ""}`;
  return scope.kind;
}

export function semanticScopeLabel(scope: SemanticGraphScope, focusLabel?: string): string {
  if (scope.kind === "focused-graph-node") return focusLabel ? `Focused: ${focusLabel}` : "Focused node";
  if (scope.kind === "changed-docs") return "Changed docs";
  if (scope.kind === "selected-docs") return "Selected docs";
  if (scope.kind === "workstream") return "Workstream";
  if (scope.kind === "repo") return "Repo";
  return "Project";
}

export function semanticScopeSummary(
  scope: SemanticGraphScope,
  focusLabel?: string
): { title: string; detail: string } {
  if (scope.kind === "focused-graph-node") {
    return {
      title: semanticScopeLabel(scope, focusLabel),
      detail: "Run review uses docs directly linked to this graph node."
    };
  }
  if (scope.kind === "changed-docs") {
    return {
      title: "Changed docs",
      detail: "Run review skips docs that already have a current extraction cache."
    };
  }
  return {
    title: semanticScopeLabel(scope, focusLabel),
    detail: "Run review uses all eligible project docs and reuses cached extractions."
  };
}

export function durableSemanticEdgeId(input?: string): string | undefined {
  if (!input || input.startsWith("proposal:")) return undefined;
  return input.length <= 256 ? input : undefined;
}

export function proposedSemanticEdgeTarget(
  input?: string
): { proposalId: string; edgeIndex: number } | undefined {
  if (!input?.startsWith("proposal:") || input.length > 320) return undefined;
  const payload = input.slice("proposal:".length);
  const separatorIndex = payload.lastIndexOf(":");
  if (separatorIndex <= 0) return undefined;

  const proposalId = payload.slice(0, separatorIndex);
  const edgeIndex = Number(payload.slice(separatorIndex + 1));
  if (!proposalId || proposalId.length > 256 || !Number.isSafeInteger(edgeIndex) || edgeIndex < 0) return undefined;
  return { proposalId, edgeIndex };
}
