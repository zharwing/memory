import { DEFAULT_MEMORY_WRITE_POLICY, nowIso } from "@zharwing/memory-core";
import type { ProjectRegistry } from "@zharwing/memory-store";
import {
  createDocument as storageCreateDocument,
  listProjectDocuments,
  movePathToTrash,
  writeDocument as storageWriteDocument
} from "@zharwing/memory-store";
import { resolveProject } from "./project-resolver.js";

export class DocumentService {
  constructor(private readonly registry: ProjectRegistry) {}

  async listDocuments(params: { projectId: string }) {
    return listProjectDocuments(await resolveProject(this.registry, params.projectId));
  }

  async createDocument(params: {
    projectId: string;
    title: string;
    type: Parameters<typeof storageCreateDocument>[0]["type"];
    body: string;
    status?: Parameters<typeof storageCreateDocument>[0]["status"];
    visibility?: Parameters<typeof storageCreateDocument>[0]["visibility"];
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
    return storageCreateDocument({ project, ...params });
  }

  async updateDocument(params: {
    projectId: string;
    documentId: string;
    title?: string;
    body?: string;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const docs = await listProjectDocuments(project);
    const doc = docs.find((candidate) => candidate.id === params.documentId);
    if (!doc) throw new Error(`Document not found: ${params.documentId}`);

    const updated = {
      ...doc,
      title: params.title?.trim() || doc.title,
      body: typeof params.body === "string" ? params.body : doc.body,
      updated: nowIso()
    };

    await storageWriteDocument(updated);
    return updated;
  }

  async deleteDocument(params: { projectId: string; documentId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const docs = await listProjectDocuments(project);
    const doc = docs.find((candidate) => candidate.id === params.documentId);
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
