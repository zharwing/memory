import { formatShortDateTime, titleCaseSlug } from "../../utils/format.js";
import type { GraphRelationshipMode } from "../../stores/graph-store.js";
import type { GraphDisplayModel, GraphStats, GraphViewMode } from "./graph-display-types.js";
import {
  graphNodeVisualKind,
  type GraphFlowElements,
  type GraphMapNode
} from "./graph-flow-model.js";

const GRAPH_POSITION_STORAGE_PREFIX = "aimem.graph.positions.d3.v2";
const GRAPH_LEGEND_PRIORITY = [
  "project",
  "repo",
  "workstream",
  "service",
  "package",
  "topic",
  "diagram-group",
  "doc",
  "diagram",
  "decision",
  "command",
  "gotcha",
  "session",
  "task",
  "file",
  "external-reference"
] as const;
const GRAPH_LEGEND_RANK = new Map<string, number>(GRAPH_LEGEND_PRIORITY.map((kind, index) => [kind, index]));
const GRAPH_LEGEND_LABELS: Record<string, string> = {
  project: "Project",
  repo: "Repo",
  workstream: "Workstream",
  service: "Service",
  package: "Package",
  topic: "Topic",
  "diagram-group": "Diagram group",
  doc: "Document",
  diagram: "Diagram",
  decision: "Decision",
  command: "Command",
  gotcha: "Gotcha",
  session: "Session",
  task: "Task",
  file: "File",
  "external-reference": "External"
};

export interface GraphLegendItem {
  kind: string;
  label: string;
  count: number;
}

export interface GraphStatusModel {
  scopeLabel: string;
  nodeCount: number;
  linkCount: number;
  relationshipLabel: string;
  hiddenCount: number;
  isRawGraph: boolean;
  generatedLabel: string;
}

export function graphPositionStorageKey(
  projectId: string,
  viewMode: GraphViewMode,
  relationshipMode: GraphRelationshipMode,
  focusedNodeId: string
): string {
  return `${GRAPH_POSITION_STORAGE_PREFIX}:${projectId}:${viewMode}:${relationshipMode}:${focusedNodeId || "overview"}`;
}

export function buildGraphStatusModel({
  graph,
  stats,
  elements,
  isRawGraph,
  focusedNodeId,
  relationshipMode
}: {
  graph: GraphDisplayModel;
  stats: GraphStats;
  elements: GraphFlowElements;
  isRawGraph: boolean;
  focusedNodeId: string;
  relationshipMode: GraphRelationshipMode;
}): GraphStatusModel {
  const generated = graph.generated;
  return {
    scopeLabel: isRawGraph
      ? "Import audit"
      : focusedNodeId
        ? `Focused: ${elements.focusLabel || "selected node"}`
        : "Context map",
    nodeCount: isRawGraph ? stats.nodes : elements.nodes.length,
    linkCount: isRawGraph ? stats.relationships : elements.edges.length,
    relationshipLabel: relationshipMode === "ai-reviewed" ? "Saved relationships" : "Metadata links",
    hiddenCount: isRawGraph
      ? stats.memberships
      : elements.hiddenMemberships + elements.hiddenLeafNodes + elements.omittedNodeCount,
    isRawGraph,
    generatedLabel: generated
      ? `${graph.displayProjected ? "Projected" : "Generated"} ${formatShortDateTime(generated)}`
      : ""
  };
}

export function buildGraphLegendItems(nodes: readonly GraphMapNode[]): GraphLegendItem[] {
  const itemsByKind = new Map<string, GraphLegendItem>();
  for (const node of nodes) {
    const kind = graphNodeVisualKind(node);
    const item = itemsByKind.get(kind);
    if (item) {
      item.count += 1;
      continue;
    }
    itemsByKind.set(kind, {
      kind,
      label: GRAPH_LEGEND_LABELS[kind] || node.typeLabel || titleCaseSlug(kind) || "Node",
      count: 1
    });
  }

  return [...itemsByKind.values()].sort((left, right) => {
    const leftRank = GRAPH_LEGEND_RANK.get(left.kind) ?? GRAPH_LEGEND_RANK.size;
    const rightRank = GRAPH_LEGEND_RANK.get(right.kind) ?? GRAPH_LEGEND_RANK.size;
    return leftRank - rightRank || right.count - left.count || left.label.localeCompare(right.label);
  });
}
