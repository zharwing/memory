import {
  clamp01 as clampConfidence,
  createId,
  nowIso,
  type Project,
  type SemanticGraphEdge,
  type SemanticGraphEdgeStatus,
  type SemanticGraphEvidence,
  type SemanticGraphRun,
  type SemanticGraphRunCounts,
  type SemanticGraphSettings
} from "@zharwing/memory-core";
import { type SemanticRelationshipCandidate } from "./candidates.js";
import { normalizeEvidence, type SemanticRelationshipDecision } from "./provider-json.js";

export interface ApplySemanticEdgePolicyInput {
  project: Project;
  settings: SemanticGraphSettings;
  run: Pick<SemanticGraphRun, "id" | "mode" | "providerId" | "providerKind" | "model">;
  candidates?: SemanticRelationshipCandidate[];
  decisions: SemanticRelationshipDecision[];
  sourceAgent?: string;
  promptVersion?: string;
}

export interface SemanticEdgePolicyResult {
  acceptedEdges: SemanticGraphEdge[];
  proposedEdges: SemanticGraphEdge[];
  dryRunEdges: SemanticGraphEdge[];
  discardedDecisions: SemanticRelationshipDecision[];
  counts: Pick<
    SemanticGraphRunCounts,
    "judged" | "accepted" | "proposed" | "discarded" | "rejected"
  >;
}

export function applySemanticEdgePolicy(input: ApplySemanticEdgePolicyInput): SemanticEdgePolicyResult {
  const candidates = new Map((input.candidates || []).map((candidate) => [candidate.id, candidate]));
  const acceptedEdges: SemanticGraphEdge[] = [];
  const proposedEdges: SemanticGraphEdge[] = [];
  const dryRunEdges: SemanticGraphEdge[] = [];
  const discardedDecisions: SemanticRelationshipDecision[] = [];

  for (const decision of input.decisions) {
    const confidence = clampConfidence(decision.confidence);
    if (decision.type === "none" || confidence < input.settings.discardBelowThreshold) {
      discardedDecisions.push({ ...decision, confidence });
      continue;
    }
    if (!decision.reason.trim() || !hasUsableEvidence(decision.evidence)) {
      discardedDecisions.push({ ...decision, confidence });
      continue;
    }

    const candidate = decision.candidateId ? candidates.get(decision.candidateId) : undefined;
    const from = decision.from || candidate?.sourceNodeId;
    const to = decision.to || candidate?.targetNodeId;
    if (!from || !to) {
      discardedDecisions.push({ ...decision, confidence });
      continue;
    }

    const edge = semanticEdgeFromDecision({
      project: input.project,
      run: input.run,
      decision: { ...decision, confidence },
      candidate,
      from,
      to,
      status: "proposed",
      sourceAgent: input.sourceAgent,
      promptVersion: input.promptVersion
    });

    if (input.run.mode === "dry-run") {
      dryRunEdges.push(edge);
      continue;
    }

    if (input.run.mode === "auto" && confidence >= input.settings.autoAcceptThreshold) {
      acceptedEdges.push({
        ...edge,
        status: "auto-accepted"
      });
      continue;
    }

    const proposalFloor =
      input.run.mode === "review"
        ? input.settings.discardBelowThreshold
        : input.settings.reviewThreshold;
    if (confidence >= proposalFloor) {
      proposedEdges.push(edge);
    } else {
      discardedDecisions.push({ ...decision, confidence });
    }
  }

  const dedupedAcceptedEdges = dedupeSemanticEdges(acceptedEdges);
  const dedupedProposedEdges = dedupeSemanticEdges(proposedEdges);
  const dedupedDryRunEdges = dedupeSemanticEdges(dryRunEdges);
  const dedupedEdgeCount =
    acceptedEdges.length + proposedEdges.length + dryRunEdges.length
    - dedupedAcceptedEdges.length - dedupedProposedEdges.length - dedupedDryRunEdges.length;

  return {
    acceptedEdges: dedupedAcceptedEdges,
    proposedEdges: dedupedProposedEdges,
    dryRunEdges: dedupedDryRunEdges,
    discardedDecisions,
    counts: {
      judged: input.decisions.length,
      accepted: dedupedAcceptedEdges.length,
      proposed: dedupedProposedEdges.length + dedupedDryRunEdges.length,
      rejected: 0,
      discarded: discardedDecisions.length + dedupedEdgeCount
    }
  };
}

function semanticEdgeFromDecision(input: {
  project: Project;
  run: Pick<SemanticGraphRun, "id" | "providerId" | "providerKind" | "model">;
  decision: SemanticRelationshipDecision;
  candidate?: SemanticRelationshipCandidate;
  from: string;
  to: string;
  status: SemanticGraphEdgeStatus;
  sourceAgent?: string;
  promptVersion?: string;
}): SemanticGraphEdge {
  const now = nowIso();
  return {
    id: createId("sem-edge"),
    projectId: input.project.id,
    from: input.from,
    to: input.to,
    type: input.decision.type === "none" ? "related" : input.decision.type,
    status: input.status,
    confidence: clampConfidence(input.decision.confidence),
    reason: input.decision.reason,
    evidence: normalizeEvidence(input.decision.evidence, input.candidate),
    source: {
      kind: "llm",
      providerId: input.run.providerId,
      providerKind: input.run.providerKind,
      model: input.run.model,
      runId: input.run.id,
      sourceAgent: input.sourceAgent,
      promptVersion: input.promptVersion
    },
    created: now,
    updated: now,
    deterministicEdgeId:
      input.decision.deterministicEdgeId || input.candidate?.deterministicEdgeIds[0]
  };
}

function dedupeSemanticEdges(edges: SemanticGraphEdge[]): SemanticGraphEdge[] {
  const byKey = new Map<string, SemanticGraphEdge>();
  for (const edge of edges) {
    const key = semanticEdgeDedupeKey(edge);
    const existing = byKey.get(key);
    if (!existing || edge.confidence > existing.confidence || edge.evidence.length > existing.evidence.length) {
      byKey.set(key, edge);
    }
  }
  return [...byKey.values()];
}

function semanticEdgeDedupeKey(edge: Pick<SemanticGraphEdge, "from" | "to" | "type">): string {
  if (edge.type === "related" && edge.from.startsWith("doc:") && edge.to.startsWith("doc:")) {
    return `related:${[edge.from, edge.to].sort().join("<->")}`;
  }
  return `${edge.type}:${edge.from}->${edge.to}`;
}

function hasUsableEvidence(evidence: Array<string | SemanticGraphEvidence> | undefined): boolean {
  return (evidence || []).some((item) => typeof item === "string" ? Boolean(item.trim()) : Boolean(item.quote.trim()));
}
