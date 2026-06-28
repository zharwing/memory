import { promises as fs } from "node:fs";
import path from "node:path";
import { createId, nowIso } from "@aimem/core";
import { ensureDir, listFiles, normalizePath, pathExists, readJson, writeJson } from "./fs.js";
export async function movePathToTrash(args) {
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
export async function writeJsonToTrash(args) {
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
export async function listTrash(memoryRoot) {
    const root = trashItemsRoot(memoryRoot);
    const files = await listFiles(root, (file) => path.basename(file) === "trash-item.json");
    const items = await Promise.all(files.map((file) => readJson(file, undefined)));
    return items.filter(isDefined).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}
export async function getTrashItem(memoryRoot, trashItemId) {
    const item = await readJson(path.join(trashItemsRoot(memoryRoot), trashItemId, "trash-item.json"), undefined);
    if (!item)
        throw new Error(`Trash item not found: ${trashItemId}`);
    return item;
}
export async function readTrashJsonPayload(item) {
    if (!item.payloadPath)
        throw new Error(`Trash item has no payload: ${item.id}`);
    return readJson(item.payloadPath, undefined);
}
export async function restorePathFromTrash(item) {
    if (!item.payloadPath || !item.originalPath) {
        throw new Error(`Trash item cannot be restored as a file: ${item.id}`);
    }
    if (await pathExists(item.originalPath)) {
        throw new Error(`Cannot restore; target already exists: ${item.originalPath}`);
    }
    await ensureDir(path.dirname(item.originalPath));
    await fs.rename(item.payloadPath, item.originalPath);
}
export async function purgeTrashItem(memoryRoot, trashItemId) {
    const item = await getTrashItem(memoryRoot, trashItemId);
    await fs.rm(path.dirname(item.metadataPath), { recursive: true, force: true });
    return item;
}
export async function removeTrashMetadata(memoryRoot, trashItemId) {
    const item = await getTrashItem(memoryRoot, trashItemId);
    await fs.rm(path.dirname(item.metadataPath), { recursive: true, force: true });
}
function createTrashItem(args) {
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
function trashItemsRoot(memoryRoot) {
    return path.join(memoryRoot, "global", "trash", "items");
}
function isDefined(value) {
    return value !== undefined;
}
//# sourceMappingURL=trash.js.map