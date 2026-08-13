import type { GraphEdge, GraphNode } from "@zharwing/memory-core";
import { labelForSlug } from "@zharwing/memory-graph";
import { titleCaseSlug } from "../../utils/format.js";
import type {
  GraphDisplayEdge,
  GraphDisplayModel,
  GraphStats,
  GraphTypeSummary,
  GraphViewMode
} from "./graph-display-types.js";

interface EdgePresentationMetadata {
  sourceKind?: string;
  semanticStatus?: string;
}

export function graphDisplayEdge(
  sourceEdge: GraphEdge,
  viewMode: GraphViewMode
): GraphDisplayEdge {
  const edgeType = sourceEdge.type || "related";
  const from = sourceEdge.from || "";
  const to = sourceEdge.to || "";

  if (edgeType === "belongs-to") {
    return {
      source: to,
      target: from,
      label: viewMode === "context" ? graphMembershipLabel(from) : undefined
    };
  }

  if (
    (edgeType === "supports" || edgeType === "explains" || edgeType === "mentions") &&
    isContextEntityNodeId(to)
  ) {
    return {
      source: to,
      target: from,
      label: edgeType === "mentions" ? "mentions" : "memory"
    };
  }

  return {
    source: from,
    target: to,
    label: graphEdgeLabel(edgeType)
  };
}

/** Splits a `kind:value` graph node id into its parts. */
export function parseGraphNodeId(nodeId: string): { kind: string; value: string } {
  const [kind, ...rest] = nodeId.split(":");
  return { kind, value: rest.join(":") || nodeId };
}

/** Human label for a node id; doc nodes resolve through the title map. */
export function graphNodeDisplayLabel(
  nodeId: string,
  documentTitles: ReadonlyMap<string, string>
): string {
  const { kind, value } = parseGraphNodeId(nodeId);
  if (kind === "doc") return documentTitles.get(value) || titleCaseSlug(value.replace(/^doc-/, ""));
  if (kind === "file") return value;
  if (kind === "topic") return titleCaseSlug(value);
  return compactGraphNodeId(nodeId);
}

/** Coarse area name for grouping semantic proposal edges by endpoint. */
export function semanticGraphArea(nodeId: string): string {
  const { kind, value } = parseGraphNodeId(nodeId);
  if (kind === "doc") return "document";
  if (kind === "repo") return "repo";
  if (kind === "service") return "service";
  if (kind === "package") return "package";
  if (kind === "topic") return "topic";
  if (kind === "diagram-group") return "diagram group";
  return kind || value || "unknown";
}

/** Shortened display form of a node id for dense lists. */
export function compactGraphNodeId(nodeId: string): string {
  const { kind, value } = parseGraphNodeId(nodeId);
  if (kind === "doc") return `doc:${value.slice(0, 8)}`;
  if (kind === "repo") return value.split(/[\\/]/).filter(Boolean).pop() || value;
  return value.length > 54 ? `${value.slice(0, 51)}...` : value;
}

export function graphEdgeColor(
  type: string,
  edge?: EdgePresentationMetadata
): string {
  const sourceKind = edge?.sourceKind || "";
  if (sourceKind.includes("semantic")) {
    return edge?.semanticStatus === "proposed" ? "#8b5cf6" : "#7c3aed";
  }
  if (type === "contains") return "#0f766e";
  if (["supports", "explains", "mentions", "uses"].includes(type)) return "#b87333";
  if (["works-on", "touched", "produced"].includes(type)) return "#c0702d";
  if (type === "contradicts") return "#b91c1c";
  if (type === "duplicates") return "#4f46e5";
  return "#8a8179";
}

export function graphNodeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "architecture-decision-record": "ADR",
    "architecture-note": "Architecture",
    "command-note": "Command",
    "diagram-group": "diagram group",
    "code-area": "code area",
    "decision-record": "Decision",
    "design-requirements-document": "Requirements",
    "external-reference": "External",
    "scratch-note": "Scratch Note",
    "technical-spec": "Spec",
    "user-flow": "User Flow"
  };
  return labels[type] || labelForSlug(type || "node");
}

export function getGraphStats(graph: GraphDisplayModel | undefined): GraphStats {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const memberships = edges.filter((sourceEdge) => sourceEdge.type === "belongs-to").length;
  const edgeTypes = summarizeEdgeTypes(edges);
  const relationships = Math.max(0, edges.length - memberships);
  return {
    nodes: nodes.length,
    memberships,
    relationships,
    edgeTypes
  };
}

export function summarizeEdgeTypes<T extends Pick<GraphEdge, "type">>(
  edges: readonly T[]
): GraphTypeSummary[] {
  return summarizeTypes(edges);
}

export function summarizeNodeTypes<T extends Pick<GraphNode, "type">>(
  nodes: readonly T[]
): GraphTypeSummary[] {
  return summarizeTypes(nodes);
}

function summarizeTypes<T extends { type: string }>(items: readonly T[]): GraphTypeSummary[] {
  const typeCounts = new Map<string, number>();
  for (const item of items) {
    const type = String(item.type || "node");
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }
  return [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));
}

export function graphEdgeLabel(type: string): string {
  const labels: Record<string, string> = {
    "belongs-to": "stored in",
    "works-on": "works on",
    touched: "touched",
    referenced: "references",
    produced: "produced",
    affects: "affects",
    supersedes: "supersedes",
    supports: "supports",
    explains: "explains",
    mentions: "mentions",
    uses: "uses",
    contains: "contains",
    "depends-on": "depends on",
    "blocked-by": "blocked by",
    related: "related",
    duplicates: "duplicates",
    contradicts: "contradicts"
  };
  return labels[type] || type;
}

export function safeGraphClassName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "node";
}

function graphMembershipLabel(from: string): string {
  if (from.startsWith("repo:")) return "linked repo";
  if (from.startsWith("workstream:")) return "workstream";
  return "stored in";
}

const CONTEXT_ENTITY_NODE_ID_PREFIXES = [
  "repo:",
  "workstream:",
  "topic:",
  "service:",
  "package:",
  "diagram-group:",
  "code-area:",
  "file:"
] as const;

function isContextEntityNodeId(id: string): boolean {
  return CONTEXT_ENTITY_NODE_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}
