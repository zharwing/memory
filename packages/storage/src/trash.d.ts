import { type TrashItem, type TrashItemType } from "@aimem/core";
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
export declare function movePathToTrash(args: TrashMoveArgs): Promise<TrashItem>;
export declare function writeJsonToTrash(args: TrashJsonArgs): Promise<TrashItem>;
export declare function listTrash(memoryRoot: string): Promise<TrashItem[]>;
export declare function getTrashItem(memoryRoot: string, trashItemId: string): Promise<TrashItem>;
export declare function readTrashJsonPayload<T>(item: TrashItem): Promise<T>;
export declare function restorePathFromTrash(item: TrashItem): Promise<void>;
export declare function purgeTrashItem(memoryRoot: string, trashItemId: string): Promise<TrashItem>;
export declare function removeTrashMetadata(memoryRoot: string, trashItemId: string): Promise<void>;
