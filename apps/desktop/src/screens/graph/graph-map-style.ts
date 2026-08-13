import type { GraphMapNode } from "./graph-flow-model.js";
import { formatConfidence, hashString } from "../../utils/format.js";

export interface GraphNodeVisualStyle {
  fill: string;
  accent: string;
  text: string;
}

export interface GraphRenderedNodeLabel {
  id: string;
  label: string;
  typeLabel: string;
  metadata: string;
  radius: number;
  isRoot: boolean;
}

export interface GraphRenderedLinkLabel {
  type: string;
  label: string;
  reason: string;
  sourceKind?: string;
  semanticStatus?: string;
  confidence?: number;
  evidence?: Array<{ quote?: string }>;
}

export function graphNodeVisualStyle(
  type: string,
  node?: Pick<GraphMapNode, "id" | "label">
): GraphNodeVisualStyle {
  if (type === "repo" && node) {
    return repoNodeVisualStyle(node);
  }

  const colors: Record<string, GraphNodeVisualStyle> = {
    project: { fill: "#e0e7ff", accent: "#4f46e5", text: "#312e81" },
    repo: { fill: "#e5f7fb", accent: "#0891b2", text: "#164e63" },
    workstream: { fill: "#ecfdf5", accent: "#059669", text: "#064e3b" },
    topic: { fill: "#e8f6f3", accent: "#0f766e", text: "#134e4a" },
    service: { fill: "#ffeded", accent: "#dc2626", text: "#7f1d1d" },
    package: { fill: "#f7ebff", accent: "#9333ea", text: "#581c87" },
    "diagram-group": { fill: "#fff7ed", accent: "#f97316", text: "#7c2d12" },
    "code-area": { fill: "#f1f5f9", accent: "#64748b", text: "#334155" },
    task: { fill: "#f0fdf4", accent: "#16a34a", text: "#14532d" },
    session: { fill: "#ecfeff", accent: "#06b6d4", text: "#155e75" },
    doc: { fill: "#eff6ff", accent: "#3b82f6", text: "#1e3a8a" },
    diagram: { fill: "#fffbeb", accent: "#f59e0b", text: "#78350f" },
    decision: { fill: "#faf5ff", accent: "#a855f7", text: "#581c87" },
    command: { fill: "#f1f5f9", accent: "#475569", text: "#1e293b" },
    gotcha: { fill: "#fff1f2", accent: "#e11d48", text: "#881337" },
    file: { fill: "#f8fafc", accent: "#94a3b8", text: "#334155" },
    "external-reference": { fill: "#fefce8", accent: "#ca8a04", text: "#713f12" }
  };
  return colors[type] || { fill: "#f5f3ff", accent: "#8b5cf6", text: "#4c1d95" };
}

export function graphMapNodeLabel(node: GraphMapNode): string {
  if (node.type === "project") return node.label;
  if (node.type === "repo") return `${node.label}\nrepo`;
  if (node.type === "workstream") return `${node.label}\nworkstream`;
  if (node.type === "topic") return `${node.label}\ntopic`;
  if (node.type === "service") return `${node.label}\nservice`;
  if (node.type === "package") return `${node.label}\npackage`;
  if (node.type === "diagram-group") return node.label.replace(/\s+diagrams$/i, "\ndiagrams");
  if (node.type === "code-area") return `${node.label}\ncode area`;
  if (node.metadata) return `${node.label}\n${node.metadata}`;
  return node.label;
}

export function graphNodeRadius(type: string, degree: number, isRoot: boolean): number {
  if (isRoot) return 72;
  if (type === "project") return 62;
  if (type === "repo" || type === "workstream") return 58;
  if (type === "topic" || type === "service" || type === "package" || type === "diagram-group" || type === "code-area") {
    return Math.min(62, 46 + degree * 1.7);
  }
  if (type === "task" || type === "session") return Math.min(54, 42 + degree * 1.4);
  return Math.min(48, 36 + degree * 1.1);
}

export function graphNodeFontSize(node: Pick<GraphRenderedNodeLabel, "isRoot" | "radius">): number {
  if (node.isRoot) return 17;
  if (node.radius >= 58) return 15;
  if (node.radius >= 48) return 13;
  return 12;
}

export function wrappedGraphLabelLines(node: GraphRenderedNodeLabel): string[] {
  const maxChars = Math.max(9, Math.floor(node.radius / 4.2));
  const sourceLines = truncateGraphLabel(node.label, node.radius > 52 ? 54 : 42).split("\n");
  const wrappedLines: string[] = [];

  for (const sourceLine of sourceLines) {
    const words = sourceLine.trim().split(/\s+/).filter(Boolean);
    let currentLine = "";
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length <= maxChars) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) wrappedLines.push(currentLine);
      currentLine = word.length > maxChars ? `${word.slice(0, Math.max(3, maxChars - 1))}...` : word;
    }
    if (currentLine) wrappedLines.push(currentLine);
  }

  const maxLines = node.radius > 54 ? 4 : 3;
  if (wrappedLines.length <= maxLines) return wrappedLines.length ? wrappedLines : [node.id];

  const visibleLines = wrappedLines.slice(0, maxLines);
  visibleLines[visibleLines.length - 1] = `${visibleLines[visibleLines.length - 1].replace(/\.+$/, "")}...`;
  return visibleLines;
}

export function graphNodeAccessibleLabel(node: GraphRenderedNodeLabel): string {
  return [node.label.replace(/\n/g, " "), node.typeLabel, node.metadata].filter(Boolean).join(", ");
}

export function graphLinkAccessibleLabel(link: GraphRenderedLinkLabel): string {
  const confidence = typeof link.confidence === "number" ? `confidence ${formatConfidence(link.confidence)}` : "";
  const evidence = (link.evidence || [])
    .map((item) => item.quote || "")
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
  return [
    link.label || link.type,
    link.sourceKind?.includes("semantic") ? "semantic" : "",
    link.semanticStatus,
    confidence,
    link.reason,
    evidence
  ].filter(Boolean).join("\n");
}

function repoNodeVisualStyle(node: Pick<GraphMapNode, "id" | "label">): GraphNodeVisualStyle {
  const palette: GraphNodeVisualStyle[] = [
    { fill: "#e0f2fe", accent: "#0284c7", text: "#0c4a6e" },
    { fill: "#dcfce7", accent: "#16a34a", text: "#14532d" },
    { fill: "#fef3c7", accent: "#d97706", text: "#78350f" },
    { fill: "#fce7f3", accent: "#db2777", text: "#831843" },
    { fill: "#ede9fe", accent: "#7c3aed", text: "#4c1d95" },
    { fill: "#ccfbf1", accent: "#0d9488", text: "#134e4a" }
  ];
  return palette[Math.abs(hashString(`${node.id}:${node.label}`)) % palette.length];
}

function truncateGraphLabel(label: string, maxLength: number): string {
  const normalized = label
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(3, maxLength - 3)).trim()}...`;
}
