import type { Project } from "@zharwing/memory-core";
import { getDocumentRepository } from "../documents.js";
import type { DocumentRepository } from "../repositories/document-repository.js";

export interface DocumentIdentityMigrationChange {
  filePath: string;
  id?: string;
  error?: string;
}

export interface DocumentIdentityMigrationReport {
  schema: "zharwing-document-identities-v1";
  projectId: string;
  scanned: number;
  materialized: number;
  unchanged: number;
  failures: number;
  changes: DocumentIdentityMigrationChange[];
}

/** Explicit migration only. Ordinary document reads never call it. */
export async function materializeDocumentIdentities(
  project: Project,
  repository: Pick<DocumentRepository, "list" | "materializeIdentity"> = getDocumentRepository()
): Promise<DocumentIdentityMigrationReport> {
  const documents = await repository.list(project);
  const changes: DocumentIdentityMigrationChange[] = [];
  let materialized = 0;
  let failures = 0;

  for (const document of documents) {
    try {
      const result = await repository.materializeIdentity(project, document.filePath);
      if (result.changed) {
        materialized += 1;
        changes.push({ filePath: document.filePath, id: result.document.id });
      }
    } catch (error) {
      failures += 1;
      changes.push({
        filePath: document.filePath,
        error: error instanceof Error ? error.message : "identity migration failed"
      });
    }
  }

  return {
    schema: "zharwing-document-identities-v1",
    projectId: project.id,
    scanned: documents.length,
    materialized,
    unchanged: documents.length - materialized - failures,
    failures,
    changes
  };
}
