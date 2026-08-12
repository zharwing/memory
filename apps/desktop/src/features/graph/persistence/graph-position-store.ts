import { readJson, remove, writeJson } from "../../../utils/storage.js";
import type { GraphNodePosition } from "../layout/graph-layout-adapter.js";

const GRAPH_POSITION_FORMAT_VERSION = 3;
const MAX_PERSISTED_GRAPH_NODES = 500;
const MAX_STORAGE_KEY_LENGTH = 320;
const MAX_POSITION_MAGNITUDE = 8_000;

export type StoredGraphNodePositionMap = Record<string, GraphNodePosition>;

interface StoredGraphNodePositionsPayload {
  version: number;
  nodeIds: string[];
  positions: StoredGraphNodePositionMap;
}

export interface PositionedGraphNode {
  id: string;
  x?: number;
  y?: number;
}

export interface GraphPositionStore {
  read(storageKey: string, nodeIds: readonly string[]): StoredGraphNodePositionMap | undefined;
  write(storageKey: string, nodes: readonly PositionedGraphNode[]): void;
  remove(storageKey: string): void;
}

export const localGraphPositionStore: GraphPositionStore = {
  read(storageKey, nodeIds) {
    if (!validStorageKey(storageKey) || !validNodeIds(nodeIds)) return undefined;
    return decodeGraphPositions(readJson<unknown>(storageKey), nodeIds);
  },

  write(storageKey, nodes) {
    if (!validStorageKey(storageKey) || nodes.length > MAX_PERSISTED_GRAPH_NODES) return;
    const positions: StoredGraphNodePositionMap = {};
    const nodeIds: string[] = [];

    for (const node of nodes) {
      if (!validNodeId(node.id)) return;
      const position = { x: Math.round(Number(node.x ?? 0)), y: Math.round(Number(node.y ?? 0)) };
      if (!isGraphNodePosition(position)) return;
      nodeIds.push(node.id);
      positions[node.id] = position;
    }

    writeJson(storageKey, {
      version: GRAPH_POSITION_FORMAT_VERSION,
      nodeIds: nodeIds.sort((left, right) => left.localeCompare(right, "en-US")),
      positions
    } satisfies StoredGraphNodePositionsPayload);
  },

  remove(storageKey) {
    if (validStorageKey(storageKey)) remove(storageKey);
  }
};

export function decodeGraphPositions(
  input: unknown,
  nodeIds: readonly string[]
): StoredGraphNodePositionMap | undefined {
  if (!validNodeIds(nodeIds) || !isStoredGraphNodePositionsPayload(input)) return undefined;
  const expectedNodeIds = [...nodeIds].sort((left, right) => left.localeCompare(right, "en-US"));
  if (!sameStringArray(input.nodeIds, expectedNodeIds)) return undefined;
  if (!expectedNodeIds.every((nodeId) => isGraphNodePosition(input.positions[nodeId]))) return undefined;
  return input.positions;
}

function validStorageKey(storageKey: string): boolean {
  return storageKey.length > 0 && storageKey.length <= MAX_STORAGE_KEY_LENGTH && !/[\0\r\n]/.test(storageKey);
}

function validNodeIds(nodeIds: readonly string[]): boolean {
  return nodeIds.length <= MAX_PERSISTED_GRAPH_NODES && nodeIds.every(validNodeId);
}

function validNodeId(nodeId: string): boolean {
  return nodeId.length > 0 && nodeId.length <= 256 && !/[\0\r\n]/.test(nodeId);
}

function isStoredGraphNodePositionsPayload(input: unknown): input is StoredGraphNodePositionsPayload {
  if (!input || typeof input !== "object") return false;
  const candidate = input as Partial<StoredGraphNodePositionsPayload>;
  return candidate.version === GRAPH_POSITION_FORMAT_VERSION &&
    Array.isArray(candidate.nodeIds) &&
    candidate.nodeIds.length <= MAX_PERSISTED_GRAPH_NODES &&
    candidate.nodeIds.every((nodeId) => typeof nodeId === "string" && validNodeId(nodeId)) &&
    Boolean(candidate.positions) &&
    typeof candidate.positions === "object";
}

function isGraphNodePosition(input: unknown): input is GraphNodePosition {
  if (!input || typeof input !== "object") return false;
  const candidate = input as Partial<GraphNodePosition>;
  return Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y) &&
    Math.abs(candidate.x!) <= MAX_POSITION_MAGNITUDE &&
    Math.abs(candidate.y!) <= MAX_POSITION_MAGNITUDE;
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
