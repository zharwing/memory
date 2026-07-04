import type { ImportConflictStrategy, ImportPlan, ImportProfile } from "@aimem/core";
import type { ProjectRegistry } from "@aimem/storage";
import { builtinImportProfiles, commitImportPlan, prepareImportPlan } from "@aimem/storage";
import { resolveProject } from "./project-resolver.js";

export class ImportService {
  constructor(private readonly registry: ProjectRegistry) {}

  listImportProfiles() {
    return builtinImportProfiles();
  }

  async prepareImport(params: {
    projectId: string;
    sourceRoot: string;
    profile?: string | ImportProfile;
    limit?: number;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    return prepareImportPlan({
      project,
      sourceRoot: params.sourceRoot,
      profile: params.profile,
      limit: params.limit
    });
  }

  async commitImport(params: {
    projectId: string;
    plan?: ImportPlan;
    sourceRoot?: string;
    profile?: string | ImportProfile;
    conflictStrategy?: ImportConflictStrategy;
    limit?: number;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    return commitImportPlan({
      project,
      plan: params.plan,
      sourceRoot: params.sourceRoot,
      profile: params.profile,
      conflictStrategy: params.conflictStrategy,
      limit: params.limit
    });
  }
}
