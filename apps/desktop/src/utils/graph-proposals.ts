export function graphRulesFromProposalPatch(proposedPatch: string | undefined): any[] | undefined {
  if (!proposedPatch?.trim()) return undefined;
  try {
    const parsed = JSON.parse(proposedPatch);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.graphRules)) return parsed.graphRules;
    if (Array.isArray(parsed?.graph_rules)) return parsed.graph_rules;
  } catch {
    return undefined;
  }
  return undefined;
}
