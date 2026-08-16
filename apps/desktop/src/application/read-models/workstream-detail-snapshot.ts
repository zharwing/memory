import type { WorkstreamDetail } from "@zharwing/memory-core";

export interface WorkstreamDetailSnapshot {
  readonly schema: "zharwing.workstream-detail-observation.v1";
  readonly observationRevision: string;
  readonly observedAt: string;
  readonly detail: WorkstreamDetail;
  readonly embedded: {
    readonly sessions: { readonly completeness: "complete" };
    readonly documents: { readonly completeness: "complete" };
  };
}

export function createWorkstreamDetailSnapshot(
  detail: WorkstreamDetail,
  observationRevision: string,
  observedAt: string
): WorkstreamDetailSnapshot {
  return Object.freeze({
    schema: "zharwing.workstream-detail-observation.v1",
    observationRevision,
    observedAt,
    detail,
    embedded: Object.freeze({
      sessions: Object.freeze({ completeness: "complete" }),
      documents: Object.freeze({ completeness: "complete" })
    })
  });
}
