import { parseGraphExtractionRules } from "@zharwing/memory-graph/rules";
import type { GraphExtractionRule } from "@zharwing/memory-core";

/** Presentation decoder only; canonical graph rule normalization lives in the graph package. */
export function graphRulesFromProposalPatch(
  proposedPatch: string | undefined
): GraphExtractionRule[] | undefined {
  if (!proposedPatch?.trim()) return undefined;
  try {
    return parseGraphExtractionRules(JSON.parse(proposedPatch));
  } catch {
    return undefined;
  }
}
