import type { Project } from "@aimem/core";
export interface RebuildIndexResult {
    projectId: string;
    indexPath: string;
    counts: {
        sessions: number;
        documents: number;
        workstreams: number;
        proposals: number;
    };
}
export declare function rebuildProjectIndex(project: Project): Promise<RebuildIndexResult>;
