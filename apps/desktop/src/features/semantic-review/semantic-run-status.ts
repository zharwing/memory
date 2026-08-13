import type { SemanticGraphRun } from "@zharwing/memory-core";

/**
 * Pure selectors over a semantic-graph run record. Shared by Shell (topbar
 * pill), DocsScreen (link-discovery banner/dialog), and GraphScreen so the
 * running/finished/progress math lives in exactly one place.
 */

export interface SemanticRunStatus {
  run: SemanticGraphRun | undefined;
  status: string;
  running: boolean;
  finished: boolean;
  documentsTotal: number;
  documentsProcessed: number;
  candidatesTotal: number;
  candidatesJudged: number;
  /** Short topbar-style progress label, e.g. `3 of 12 links` or `starting`. */
  progressLabel: string;
}

export function semanticRunStatus(
  run: SemanticGraphRun | undefined,
  analysisRunning = false
): SemanticRunStatus {
  const status = run?.status ?? "";
  const counts = run?.counts;
  const running = analysisRunning || status === "running" || status === "pending";
  const finished = Boolean(run && !running && ["completed", "failed", "cancelled"].includes(status));
  const documentsTotal = counts?.documentsTotal ?? 0;
  const documentsProcessed = Math.min(
    documentsTotal || Number.MAX_SAFE_INTEGER,
    (counts?.documentsAnalyzed ?? 0) + (counts?.extractionsReused ?? 0)
  );
  const candidatesTotal = counts?.candidates ?? 0;
  const candidatesJudged = counts?.judged ?? 0;

  return {
    run,
    status,
    running,
    finished,
    documentsTotal,
    documentsProcessed,
    candidatesTotal,
    candidatesJudged,
    progressLabel: semanticRunProgressLabel(documentsTotal, documentsProcessed, candidatesTotal, candidatesJudged)
  };
}

function semanticRunProgressLabel(
  documentsTotal: number,
  documentsProcessed: number,
  candidatesTotal: number,
  candidatesJudged: number
): string {
  if (candidatesTotal > 0) return `${Math.min(candidatesTotal, candidatesJudged)} of ${candidatesTotal} links`;
  if (documentsTotal > 0) return `${documentsProcessed} of ${documentsTotal} docs`;
  return "starting";
}
