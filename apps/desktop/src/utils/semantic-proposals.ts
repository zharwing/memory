export interface SemanticProposalEdge {
  from: string;
  to: string;
  type: string;
  confidence: number;
  reason: string;
  evidence: Array<{ quote: string; documentId?: string; location?: string; sourcePath?: string }>;
}

export interface SemanticProposalPatch {
  kind: "semantic-graph-edges";
  runId: string;
  edges: SemanticProposalEdge[];
}

export function semanticEdgesFromProposalPatch(proposedPatch: string | undefined): SemanticProposalPatch | undefined {
  if (!proposedPatch?.trim()) return undefined;
  try {
    const parsed = JSON.parse(proposedPatch);
    if (parsed?.kind !== "semantic-graph-edges" || !Array.isArray(parsed.edges)) return undefined;
    const edges = parsed.edges
      .map((edge: any) => ({
        from: String(edge?.from || ""),
        to: String(edge?.to || ""),
        type: String(edge?.type || ""),
        confidence: Number(edge?.confidence || 0),
        reason: String(edge?.reason || ""),
        evidence: Array.isArray(edge?.evidence)
          ? edge.evidence
              .map((item: any) => typeof item === "string" ? { quote: item } : item)
              .filter((item: any) => item && typeof item.quote === "string")
          : []
      }))
      .filter((edge: SemanticProposalEdge) => edge.from && edge.to && edge.type && edge.reason);
    if (edges.length === 0) return undefined;
    return {
      kind: "semantic-graph-edges",
      runId: String(parsed.runId || "external-semantic-run"),
      edges
    };
  } catch {
    return undefined;
  }
}
