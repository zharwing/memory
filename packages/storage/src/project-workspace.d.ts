import { type Project, type ProjectCreationPreview, type ProjectDetectionResult, type RepoLink } from "@aimem/core";
import { ProjectRegistry } from "./registry.js";
export interface PointerFile {
    projectId: string;
    memoryRoot: string;
    contextPolicy?: {
        directSessionInclusionDays: number;
        summaryOnlyDays: number;
        maxRawSessions: number;
        maxSummarizedSessions: number;
    };
}
export declare function findRepoRoot(start: string): Promise<string | undefined>;
export declare function findPointerFile(start: string): Promise<string | undefined>;
export declare function detectProject(args: {
    workingDirectory: string;
    registry: ProjectRegistry;
}): Promise<ProjectDetectionResult>;
export declare function prepareProjectCreation(args: {
    workingDirectory?: string;
    registry: ProjectRegistry;
    projectName?: string;
    createPointerFile?: boolean;
    bootstrapFiles?: string[];
}): Promise<ProjectCreationPreview>;
export declare function createProjectFromPreview(args: {
    preview: ProjectCreationPreview;
    registry: ProjectRegistry;
    forceWithoutConfirmation?: boolean;
}): Promise<Project>;
export declare function ensureProjectWorkspace(project: Project): Promise<void>;
export declare function writeProjectFile(project: Project): Promise<void>;
export declare function linkProjectRepo(args: {
    project: Project;
    repoPath: string;
    role?: RepoLink["role"];
    name?: string;
    description?: string;
    defaultBranch?: string;
    writePointerFile?: boolean;
}): Promise<{
    project: Project;
    repo: RepoLink;
    action: "created" | "updated";
    pointerFilePath?: string;
}>;
export declare function unlinkProjectRepo(args: {
    project: Project;
    repoPath: string;
    removePointerFile?: boolean;
}): Promise<{
    project: Project;
    removedRepo: RepoLink;
    pointerFilePath?: string;
    pointerRemoved: boolean;
}>;
export declare function resolveRepoLinkPath(input: string): Promise<string>;
export declare function writePointerFile(pointerFilePath: string, project: Project): Promise<void>;
export declare function validateProjectWorkspace(project: Project): Promise<string[]>;
