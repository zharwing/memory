import type { MemoryWritePolicy, Project } from "./types.js";
export declare function createProjectModel(args: {
    name: string;
    memoryRoot: string;
    repoPath?: string;
    slug?: string;
}): Project;
export declare function memoryWritePolicyFor(project: Pick<Project, "memoryWritePolicy">): MemoryWritePolicy;
export declare function isVisibleToAi(visibility: string): boolean;
export declare function shouldBlockVisibility(visibility: string): boolean;
