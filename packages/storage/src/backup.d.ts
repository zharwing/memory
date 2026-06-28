import { type Project } from "@aimem/core";
export interface BackupSnapshot {
    projectId: string;
    created: string;
    snapshotPath: string;
    note: string;
}
export declare function createProjectSnapshot(project: Project): Promise<BackupSnapshot>;
export declare function listProjectSnapshots(project: Project): Promise<BackupSnapshot[]>;
