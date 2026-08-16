import { DEFAULT_MEMORY_WRITE_POLICY, nowIso, type Project } from "@zharwing/memory-core";
import type { DocumentRepository, ProjectRegistry } from "@zharwing/memory-store";
import {
  getDocumentRepository,
  movePathToTrash,
} from "@zharwing/memory-store";
import { resolveProject } from "./project-resolver.js";

/** Consumer-owned document persistence port; daemon composition supplies the concrete repository. */
export interface DocumentRepositoryPort { create: DocumentRepository["create"]; list: DocumentRepository["list"]; findById: DocumentRepository["findById"]; save: DocumentRepository["save"]; }
export class DocumentService {
  constructor(private readonly registry: ProjectRegistry, readonly repository: DocumentRepository = getDocumentRepository()) {}

  async list(project: Project) {
    return this.repository.list(project);
  }

  async listDocuments(params: { projectId: string }) {
    return this.repository.list(await resolveProject(this.registry, params.projectId));
  }

  async createDocument(params: {
    projectId: string;
    title: string;
    type: Parameters<DocumentRepository["create"]>[0]["type"];
    body: string;
    status?: Parameters<DocumentRepository["create"]>[0]["status"];
    visibility?: Parameters<DocumentRepository["create"]>[0]["visibility"];
    topics?: string[];
    relatedFiles?: string[];
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const policy = {
      ...DEFAULT_MEMORY_WRITE_POLICY,
      ...(project.memoryWritePolicy || {})
    };
    if (!policy.allowAgentDirectWrites) {
      throw new Error("Direct memory writes are disabled for this project. Use memory.propose_memory_update or turn review mode off in Settings.");
    }
    return this.repository.create({ project, ...params });
  }

  async updateDocument(params: {
    projectId: string;
    documentId: string;
    title?: string;
    body?: string;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const doc = await this.repository.findById(project, params.documentId);
    if (!doc) throw new Error(`Document not found: ${params.documentId}`);

    const updated = {
      ...doc,
      title: params.title?.trim() || doc.title,
      body: typeof params.body === "string" ? params.body : doc.body,
      updated: nowIso()
    };

    await this.repository.save(updated, project);
    return updated;
  }

  async deleteDocument(params: { projectId: string; documentId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const doc = await this.repository.findById(project, params.documentId);
    if (!doc) throw new Error(`Document not found: ${params.documentId}`);
    return movePathToTrash({
      memoryRoot: this.registry.memoryRoot,
      type: "document",
      projectId: project.id,
      projectName: project.name,
      itemId: doc.id,
      title: doc.title,
      originalPath: doc.filePath,
      critical: ["overview", "privacy", "commands", "glossary"].includes(doc.type),
      details: { type: doc.type, status: doc.status, visibility: doc.visibility }
    });
  }
}
