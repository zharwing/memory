import { type ImportCommitResult, type ImportConflictStrategy, type ImportPlan, type ImportProfile, type Project } from "@aimem/core";
export declare function builtinImportProfiles(): ImportProfile[];
export declare function resolveImportProfile(profile?: string | ImportProfile): ImportProfile;
export declare function prepareImportPlan(args: {
    project: Project;
    sourceRoot: string;
    profile?: string | ImportProfile;
    limit?: number;
}): Promise<ImportPlan>;
export declare function commitImportPlan(args: {
    project: Project;
    plan?: ImportPlan;
    sourceRoot?: string;
    profile?: string | ImportProfile;
    conflictStrategy?: ImportConflictStrategy;
    limit?: number;
}): Promise<ImportCommitResult>;
