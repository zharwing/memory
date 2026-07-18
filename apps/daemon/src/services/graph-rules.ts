import type { GraphExtractionRule, GraphRuleEdgeType, GraphRuleNodeType } from "@zharwing/memory-core";

export function normalizeGraphExtractionRules(input: unknown): GraphExtractionRule[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((rule) => normalizeGraphExtractionRule(rule))
    .filter(isDefined);
}

function normalizeGraphExtractionRule(input: unknown): GraphExtractionRule | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const match = stringValue(record.match);
  const nodeType = normalizeGraphRuleNodeType(stringValue(record.nodeType) || stringValue(record.node_type));
  if (!match || !nodeType) return undefined;

  const normalized: GraphExtractionRule = { match, nodeType };
  const label = stringValue(record.label);
  const topic = stringValue(record.topic);
  const edgeType = normalizeGraphRuleEdgeType(stringValue(record.edgeType) || stringValue(record.edge_type));
  const segment = numberValue(record.segment);
  const slugFromSegment = numberValue(record.slugFromSegment ?? record.slug_from_segment);
  const labelFromSegment = numberValue(record.labelFromSegment ?? record.label_from_segment);
  if (label) normalized.label = label;
  if (topic) normalized.topic = topic;
  if (edgeType) normalized.edgeType = edgeType;
  if (segment !== undefined) normalized.segment = segment;
  if (slugFromSegment !== undefined) normalized.slugFromSegment = slugFromSegment;
  if (labelFromSegment !== undefined) normalized.labelFromSegment = labelFromSegment;
  return normalized;
}

function normalizeGraphRuleNodeType(input: string | undefined): GraphRuleNodeType | undefined {
  const value = input?.trim().toLowerCase().replace(/_/g, "-");
  return GRAPH_RULE_NODE_TYPES.has(value as GraphRuleNodeType) ? value as GraphRuleNodeType : undefined;
}

function normalizeGraphRuleEdgeType(input: string | undefined): GraphRuleEdgeType | undefined {
  const value = input?.trim().toLowerCase().replace(/_/g, "-");
  return GRAPH_RULE_EDGE_TYPES.has(value as GraphRuleEdgeType) ? value as GraphRuleEdgeType : undefined;
}

function stringValue(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function numberValue(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) return Math.trunc(input);
  if (typeof input === "string" && input.trim() && Number.isFinite(Number(input))) return Math.trunc(Number(input));
  return undefined;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

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
