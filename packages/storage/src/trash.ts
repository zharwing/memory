import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createId,
  nowIso,
  type TrashItem,
  type TrashItemType
} from "@zharwing/memory-core";
import { ensureDir, listFiles, normalizePath, pathExists, readJson, writeJson } from "./fs.js";

export interface TrashMoveArgs {
  memoryRoot: string;
  type: TrashItemType;
  itemId: string;
  title: string;
  projectId?: string;
  projectName?: string;
  originalPath: string;
  critical?: boolean;
  canRestore?: boolean;
  details?: Record<string, unknown>;
}

export interface TrashJsonArgs {
  memoryRoot: string;
  type: TrashItemType;
  itemId: string;
  title: string;
  payload: unknown;
  projectId?: string;
  projectName?: string;
  critical?: boolean;
  canRestore?: boolean;
  details?: Record<string, unknown>;
}

export async function movePathToTrash(args: TrashMoveArgs): Promise<TrashItem> {
  if (!(await pathExists(args.originalPath))) {
    throw new Error(`Cannot delete missing item: ${args.originalPath}`);
  }
  const item = createTrashItem(args);
  const itemDir = path.dirname(item.metadataPath);
  const payloadPath = path.join(itemDir, "payload", path.basename(args.originalPath));
  await ensureDir(path.dirname(payloadPath));
  await fs.rename(args.originalPath, payloadPath);
  const next = {
    ...item,
    payloadPath: normalizePath(payloadPath)
  };
  await writeJson(item.metadataPath, next);
  return next;
}

export async function writeJsonToTrash(args: TrashJsonArgs): Promise<TrashItem> {
  const item = createTrashItem(args);
  const payloadPath = path.join(path.dirname(item.metadataPath), "payload", "item.json");
  await writeJson(payloadPath, args.payload);
  const next = {
    ...item,
    payloadPath: normalizePath(payloadPath)
  };
  await writeJson(item.metadataPath, next);
  return next;
}

export async function listTrash(memoryRoot: string): Promise<TrashItem[]> {
  const root = trashItemsRoot(memoryRoot);
  const files = await listFiles(root, (file) => path.basename(file) === "trash-item.json");
  const items = await Promise.all(files.map((file) => readJson<TrashItem | undefined>(file, undefined)));
  return items.filter(isDefined).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function getTrashItem(memoryRoot: string, trashItemId: string): Promise<TrashItem> {
  const item = await readJson<TrashItem | undefined>(
    path.join(trashItemsRoot(memoryRoot), trashItemId, "trash-item.json"),
    undefined
  );
  if (!item) throw new Error(`Trash item not found: ${trashItemId}`);
  return item;
}

export async function readTrashJsonPayload<T>(item: TrashItem): Promise<T> {
  if (!item.payloadPath) throw new Error(`Trash item has no payload: ${item.id}`);
  return readJson<T>(item.payloadPath, undefined as T);
}

export async function restorePathFromTrash(item: TrashItem): Promise<void> {
  if (!item.payloadPath || !item.originalPath) {
    throw new Error(`Trash item cannot be restored as a file: ${item.id}`);
  }
  if (await pathExists(item.originalPath)) {
    throw new Error(`Cannot restore; target already exists: ${item.originalPath}`);
  }
  await ensureDir(path.dirname(item.originalPath));
  await fs.rename(item.payloadPath, item.originalPath);
}

export async function purgeTrashItem(memoryRoot: string, trashItemId: string): Promise<TrashItem> {
  const item = await getTrashItem(memoryRoot, trashItemId);
  await fs.rm(path.dirname(item.metadataPath), { recursive: true, force: true });
  return item;
}

export async function removeTrashMetadata(memoryRoot: string, trashItemId: string): Promise<void> {
  const item = await getTrashItem(memoryRoot, trashItemId);
  await fs.rm(path.dirname(item.metadataPath), { recursive: true, force: true });
}

function createTrashItem(args: TrashMoveArgs | TrashJsonArgs): TrashItem {
  const id = createId("trash");
  const metadataPath = path.join(trashItemsRoot(args.memoryRoot), id, "trash-item.json");
  return {
    id,
    type: args.type,
    projectId: args.projectId,
    projectName: args.projectName,
    itemId: args.itemId,
    title: args.title,
    deletedAt: nowIso(),
    originalPath: "originalPath" in args ? normalizePath(args.originalPath) : undefined,
    metadataPath: normalizePath(metadataPath),
    critical: Boolean(args.critical),
    canRestore: args.canRestore ?? true,
    details: args.details
  };
}

function trashItemsRoot(memoryRoot: string): string {
  return path.join(memoryRoot, "global", "trash", "items");
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
