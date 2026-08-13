import type { D3GraphLink, D3GraphNode } from "./graph-map-model.js";

export interface GraphBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphFitTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export function graphLinkPath(link: D3GraphLink): string {
  const source = resolveLinkNode(link.source);
  const target = resolveLinkNode(link.target);
  const sourceX = Number(source.x || 0);
  const sourceY = Number(source.y || 0);
  const targetX = Number(target.x || 0);
  const targetY = Number(target.y || 0);
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const unitX = dx / distance;
  const unitY = dy / distance;
  const startX = sourceX + unitX * (source.radius + 8);
  const startY = sourceY + unitY * (source.radius + 8);
  const endX = targetX - unitX * (target.radius + 12);
  const endY = targetY - unitY * (target.radius + 12);
  const bend = Math.min(92, distance * (link.type === "contains" ? 0.075 : 0.13));
  const direction = stableHash(`${link.id}:${link.type}`) % 2 === 0 ? -1 : 1;
  const controlX = (startX + endX) / 2 - unitY * bend * direction;
  const controlY = (startY + endY) / 2 + unitX * bend * direction;

  return `M${roundPathNumber(startX)},${roundPathNumber(startY)}Q${roundPathNumber(controlX)},${roundPathNumber(controlY)} ${roundPathNumber(endX)},${roundPathNumber(endY)}`;
}

export function graphBounds(nodes: readonly D3GraphNode[]): GraphBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const x = Number(node.x || 0);
    const y = Number(node.y || 0);
    minX = Math.min(minX, x - node.radius);
    maxX = Math.max(maxX, x + node.radius);
    minY = Math.min(minY, y - node.radius);
    maxY = Math.max(maxY, y + node.radius);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { x: -100, y: -100, width: 200, height: 200 };
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

export function graphFitTransform(
  nodes: readonly D3GraphNode[],
  containerWidth: number,
  containerHeight: number,
  padding: number,
  minZoom: number,
  maxZoom: number
): GraphFitTransform | undefined {
  if (!nodes.length || !containerWidth || !containerHeight) return undefined;
  const bounds = graphBounds(nodes);
  const availableWidth = Math.max(320, containerWidth - padding * 2);
  const availableHeight = Math.max(260, containerHeight - padding * 2);
  const scale = Math.max(
    minZoom,
    Math.min(maxZoom, Math.min(availableWidth / bounds.width, availableHeight / bounds.height))
  );
  return {
    scale,
    translateX: containerWidth / 2 - scale * (bounds.x + bounds.width / 2),
    translateY: containerHeight / 2 - scale * (bounds.y + bounds.height / 2)
  };
}

function resolveLinkNode(node: string | D3GraphNode): Pick<D3GraphNode, "x" | "y" | "radius"> {
  if (typeof node !== "string") return node;
  return { x: 0, y: 0, radius: 40 };
}

/** FNV-1a keeps curve direction stable over small moduli. */
function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function roundPathNumber(value: number): number {
  return Math.round(value * 10) / 10;
}
