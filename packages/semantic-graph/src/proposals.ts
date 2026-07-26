import {
  clamp01,
  type SemanticGraphEdge,
  type SemanticGraphEdgeType,
  type SemanticGraphEvidence
} from "@zharwing/memory-core";

/**
 * Browser-safe proposal helpers. This module must stay free of node: imports
 * so UI bundles can import it without pulling in the rest of the package
 * barrel (which uses node:crypto).
 */

export interface SemanticGraphProposalPatch {
  kind: "semantic-graph-edges";
  runId: string;
  summary?: SemanticGraphProposalSummary;
  edges: Array<{
    from: string;
    to: string;
    type: SemanticGraphEdgeType;
    confidence: number;
    reason: string;
    evidence: SemanticGraphEvidence[];
  }>;
}

export interface SemanticGraphProposalSummary {
  title: string;
  summary: string;
  keyRelationships: string[];
  reviewNotes: string[];
}

export function semanticEdgesProposalPatch(
  runId: string,
  edges: SemanticGraphEdge[],
  summary?: SemanticGraphProposalSummary
): string {
  const patch: SemanticGraphProposalPatch = {
    kind: "semantic-graph-edges",
    runId,
    ...(summary ? { summary } : {}),
    edges: edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      type: edge.type,
      confidence: edge.confidence,
      reason: edge.reason,
      evidence: edge.evidence
    }))
  };
  return `${JSON.stringify(patch, null, 2)}\n`;
}

export function semanticEdgesFromProposalPatch(proposedPatch: string | undefined): SemanticGraphProposalPatch | undefined {
  if (!proposedPatch?.trim()) return undefined;
  try {
    const parsed = JSON.parse(proposedPatch) as Partial<SemanticGraphProposalPatch>;
    if (parsed.kind !== "semantic-graph-edges" || !Array.isArray(parsed.edges)) return undefined;
    const edges = parsed.edges
      .map((edge) => ({
        from: String(edge?.from || ""),
        to: String(edge?.to || ""),
        type: edge?.type as SemanticGraphEdgeType,
        confidence: clamp01(Number(edge?.confidence)),
        reason: String(edge?.reason || ""),
        evidence: Array.isArray(edge?.evidence) ? edge.evidence.filter(isSemanticEvidence) : []
      }))
      .filter((edge) => edge.from && edge.to && edge.type && edge.reason);
    if (edges.length === 0) return undefined;
    return {
      kind: "semantic-graph-edges",
      runId: String(parsed.runId || "external-semantic-run"),
      summary: normalizeProposalSummary(parsed.summary),
      edges
    };
  } catch {
    return undefined;
  }
}

export function semanticProposalSummaryFromProviderJson(input: unknown): SemanticGraphProposalSummary {
  const value = record(input);
  const summary = stringValue(value.summary).slice(0, 1200).trim();
  if (!summary) {
    throw new Error("Provider did not return a semantic proposal summary.");
  }
  return {
    title: stringValue(value.title).slice(0, 120).trim() || "AI relationship review",
    summary,
    keyRelationships: arrayValue(value.keyRelationships ?? value.key_relationships)
      .map(stringValue)
      .filter(Boolean)
      .slice(0, 8),
    reviewNotes: arrayValue(value.reviewNotes ?? value.review_notes)
      .map(stringValue)
      .filter(Boolean)
      .slice(0, 6)
  };
}

export function normalizeProposalSummary(input: unknown): SemanticGraphProposalSummary | undefined {
  try {
    return semanticProposalSummaryFromProviderJson(input);
  } catch {
    return undefined;
  }
}

export function isSemanticEvidence(input: unknown): input is SemanticGraphEvidence {
  return Boolean(input && typeof input === "object" && typeof (input as SemanticGraphEvidence).quote === "string");
}

export function record(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

export function arrayValue(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

export function stringValue(input: unknown): string {
  return String(input || "").trim();
}

export function stringOrUndefined(input: unknown): string | undefined {
  const value = stringValue(input);
  return value || undefined;
}
