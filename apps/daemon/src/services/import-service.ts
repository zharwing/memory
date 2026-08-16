import type { ImportConflictStrategy, ImportPlan, ImportProfile } from "@zharwing/memory-core";
import type { DocumentRepository, ProjectRegistry } from "@zharwing/memory-store";
import { builtinImportProfiles, commitImportPlan, prepareImportPlan } from "@zharwing/memory-store";
import { resolveProject } from "./project-resolver.js";

export class ImportService {
  constructor(private readonly registry: ProjectRegistry, private readonly documents: Pick<DocumentRepository, "read" | "save">) {}

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
      limit: params.limit,
      documentRepository: this.documents
    });
  }
}
