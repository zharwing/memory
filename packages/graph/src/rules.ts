import {
  numberValue,
  stringValue,
  type GraphExtractionRule,
  type GraphRuleEdgeType,
  type GraphRuleNodeType
} from "@zharwing/memory-core";

const nodeTypes = new Set<GraphRuleNodeType>([
  "topic",
  "service",
  "package",
  "diagram-group",
  "code-area",
  "external-reference"
]);
const edgeTypes = new Set<GraphRuleEdgeType>([
  "supports",
  "explains",
  "mentions",
  "uses",
  "contains",
  "depends-on",
  "related"
]);

/** Compatibility readers used by the domain projection for already-normalized
 * and legacy rule records. Keeping them here prevents a second parser in the
 * daemon or desktop packages. */
export function readGraphRuleString(rule: GraphExtractionRule, ...keys: string[]): string | undefined {
  const value = rule as unknown as Record<string, unknown>;
  return readString(value, ...keys);
}

export function readGraphRuleNumber(rule: GraphExtractionRule, ...keys: string[]): number | undefined {
  const value = rule as unknown as Record<string, unknown>;
  return readInteger(value, ...keys);
}

export function normalizeGraphRuleNodeType(value: string | undefined): GraphRuleNodeType | undefined {
  return normalizeEnum(value, nodeTypes);
}

export function normalizeGraphRuleEdgeType(value: string | undefined): GraphRuleEdgeType | undefined {
  return normalizeEnum(value, edgeTypes);
}

/** Canonical parser for persisted camelCase and legacy snake_case graph-rule payloads. */
export function normalizeGraphExtractionRule(input: unknown): GraphExtractionRule | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = input as Record<string, unknown>;
  const match = readString(value, "match");
  const nodeType = readEnum(value, nodeTypes, "nodeType", "node_type");
  if (!match || !nodeType) return undefined;

  const rule: GraphExtractionRule = { match, nodeType };
  const edgeType = readEnum(value, edgeTypes, "edgeType", "edge_type");
  const label = readString(value, "label");
  const configuredSlug = readString(value, "slug");
  const topic = readString(value, "topic");
  const segment = readInteger(value, "segment");
  const slugFromSegment = readInteger(value, "slugFromSegment", "slug_from_segment");
  const labelFromSegment = readInteger(value, "labelFromSegment", "label_from_segment");

  if (edgeType) rule.edgeType = edgeType;
  if (label) rule.label = label;
  if (configuredSlug) rule.slug = configuredSlug;
  if (topic) rule.topic = topic;
  if (segment !== undefined) rule.segment = segment;
  if (slugFromSegment !== undefined) rule.slugFromSegment = slugFromSegment;
  if (labelFromSegment !== undefined) rule.labelFromSegment = labelFromSegment;
  return rule;
}

/**
 * Forgiving compatibility normalizer used for stored project data and direct
 * update paths. Invalid entries are omitted, matching historical behavior.
 */
export function normalizeGraphExtractionRules(input: unknown): GraphExtractionRule[] {
  return parseGraphExtractionRuleList(input, false) ?? [];
}

/** Strict collection parser used when a proposal must be accepted atomically. */
export function parseGraphExtractionRules(input: unknown): GraphExtractionRule[] | undefined {
  return parseGraphExtractionRuleList(input, true);
}

function parseGraphExtractionRuleList(
  input: unknown,
  strict: boolean
): GraphExtractionRule[] | undefined {
  const candidates = graphRuleCandidates(input);
  if (!candidates) return undefined;
  const rules: GraphExtractionRule[] = [];
  for (const candidate of candidates) {
    const rule = normalizeGraphExtractionRule(candidate);
    if (!rule) {
      if (strict) return undefined;
      continue;
    }
    rules.push(rule);
  }
  return rules;
}

function graphRuleCandidates(input: unknown): unknown[] | undefined {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  for (const key of ["graphRules", "graph_rules"] as const) {
    if (Array.isArray(value[key])) return value[key];
  }
  return undefined;
}

function readString(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const parsed = stringValue(value[key]);
    if (parsed) return parsed;
  }
  return undefined;
}

function readInteger(value: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const parsed = numberValue(value[key]);
    if (parsed !== undefined) return Math.trunc(parsed);
  }
  return undefined;
}

function readEnum<Value extends string>(
  value: Record<string, unknown>,
  allowed: ReadonlySet<Value>,
  ...keys: string[]
): Value | undefined {
  for (const key of keys) {
    const parsed = stringValue(value[key])?.toLowerCase().replace(/_/g, "-") as Value | undefined;
    if (parsed && allowed.has(parsed)) return parsed;
  }
  return undefined;
}

function normalizeEnum<Value extends string>(value: string | undefined, allowed: ReadonlySet<Value>): Value | undefined {
  const normalized = value?.trim().toLowerCase().replace(/_/g, "-") as Value | undefined;
  return normalized && allowed.has(normalized) ? normalized : undefined;
}
