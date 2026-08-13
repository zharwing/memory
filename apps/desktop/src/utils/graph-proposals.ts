import type {
  GraphExtractionRule,
  GraphRuleEdgeType,
  GraphRuleNodeType
} from "@zharwing/memory-core";

const GRAPH_RULE_NODE_TYPES = new Set<GraphRuleNodeType>([
  "topic",
  "service",
  "package",
  "diagram-group",
  "code-area",
  "external-reference"
]);
const GRAPH_RULE_EDGE_TYPES = new Set<GraphRuleEdgeType>([
  "supports",
  "explains",
  "mentions",
  "uses",
  "contains",
  "depends-on",
  "related"
]);

export function graphRulesFromProposalPatch(proposedPatch: string | undefined): GraphExtractionRule[] | undefined {
  if (!proposedPatch?.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(proposedPatch);
    const candidate = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.graphRules)
        ? parsed.graphRules
        : isRecord(parsed) && Array.isArray(parsed.graph_rules)
          ? parsed.graph_rules
          : undefined;
    if (!candidate) return undefined;
    const normalized = candidate.map(normalizeGraphExtractionRule);
    return normalized.every((rule): rule is GraphExtractionRule => rule !== undefined)
      ? normalized
      : undefined;
  } catch {
    return undefined;
  }
  return undefined;
}

function normalizeGraphExtractionRule(value: unknown): GraphExtractionRule | undefined {
  if (!isRecord(value)) return undefined;
  const match = stringValue(value.match);
  const nodeType = normalizedEnum(
    stringValue(value.nodeType) ?? stringValue(value.node_type),
    GRAPH_RULE_NODE_TYPES
  );
  if (!match || !nodeType) return undefined;

  const edgeType = normalizedEnum(
    stringValue(value.edgeType) ?? stringValue(value.edge_type),
    GRAPH_RULE_EDGE_TYPES
  );
  const label = stringValue(value.label);
  const topic = stringValue(value.topic);
  const segment = integerValue(value.segment);
  const slugFromSegment = integerValue(value.slugFromSegment ?? value.slug_from_segment);
  const labelFromSegment = integerValue(value.labelFromSegment ?? value.label_from_segment);
  const normalized: GraphExtractionRule = { match, nodeType };
  if (edgeType) normalized.edgeType = edgeType;
  if (label) normalized.label = label;
  if (topic) normalized.topic = topic;
  if (segment !== undefined) normalized.segment = segment;
  if (slugFromSegment !== undefined) normalized.slugFromSegment = slugFromSegment;
  if (labelFromSegment !== undefined) normalized.labelFromSegment = labelFromSegment;
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function normalizedEnum<Value extends string>(
  value: string | undefined,
  allowed: ReadonlySet<Value>
): Value | undefined {
  const normalized = value?.toLowerCase().replace(/_/g, "-") as Value | undefined;
  return normalized && allowed.has(normalized) ? normalized : undefined;
}
