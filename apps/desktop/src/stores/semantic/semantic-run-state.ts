import type {
  OperationInput,
  SemanticGraphMode,
  SemanticGraphRun
} from "@zharwing/memory-core";

export function isSemanticAnalysisRunActive(run: SemanticGraphRun | undefined): boolean {
  const status = String(run?.status || "");
  return status === "running" || status === "pending";
}

export function createPendingSemanticAnalysisRun(
  input: OperationInput<"memory.analyze_semantic_graph">,
  configuredMode: SemanticGraphMode | undefined,
  started: string
): SemanticGraphRun {
  return {
    id: "pending-ui-run",
    projectId: input.projectId,
    status: "pending",
    mode: input.mode ?? (input.dryRun ? "dry-run" : configuredMode ?? "review"),
    scope: input.scope ?? { kind: "all-docs" },
    started,
    thresholds: {
      autoAccept: 0,
      review: 0,
      discardBelow: 0
    },
    counts: {
      documentsTotal: 0,
      documentsAnalyzed: 0,
      extractionsReused: 0,
      candidates: 0,
      judged: 0,
      accepted: 0,
      proposed: 0,
      rejected: 0,
      discarded: 0
    }
  };
}

export function shouldKeepPendingSemanticAnalysisRun(
  currentRun: SemanticGraphRun | undefined,
  latestRun: SemanticGraphRun | undefined,
  currentlyRunning: boolean
): boolean {
  if (currentRun && latestRun && currentRun.id !== latestRun.id) {
    const currentTime = Math.max(timestampMs(currentRun.finished), timestampMs(currentRun.started));
    const latestTime = Math.max(timestampMs(latestRun.finished), timestampMs(latestRun.started));
    if (latestTime < currentTime) return true;
  }
  if (!currentlyRunning || currentRun?.id !== "pending-ui-run") return false;
  if (isSemanticAnalysisRunActive(latestRun)) return false;
  if (!latestRun) return true;
  return timestampMs(latestRun.started) < timestampMs(currentRun.started);
}

function timestampMs(input: unknown): number {
  const value = typeof input === "string" ? Date.parse(input) : NaN;
  return Number.isFinite(value) ? value : 0;
}
