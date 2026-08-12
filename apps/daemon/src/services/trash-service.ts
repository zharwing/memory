import path from "node:path";
import type { Project, RepoLink } from "@zharwing/memory-core";
import type { ProjectRegistry } from "@zharwing/memory-store";
import {
  linkProjectRepo,
  listTrash as storageListTrash,
  purgeTrashItem as storagePurgeTrashItem,
  readJson,
  readTrashJsonPayload,
  removeTrashMetadata,
  restorePathFromTrash
} from "@zharwing/memory-store";
import { resolveProject } from "./project-resolver.js";

export class TrashService {
  constructor(private readonly registry: ProjectRegistry) {}

  async listTrash(params: { projectId: string }) {
    return (await storageListTrash(this.registry.memoryRoot)).filter(
      (item) => item.projectId === params.projectId || (item.type === "project" && item.itemId === params.projectId)
    );
  }

  async restoreTrashItem(params: { projectId: string; trashItemId: string }) {
    const item = (await storageListTrash(this.registry.memoryRoot)).find((candidate) => candidate.id === params.trashItemId);
    if (!item) throw new Error(`Trash item not found: ${params.trashItemId}`);
    requireProject(item, params.projectId);

    if (item.type === "project") {
      await restorePathFromTrash(item);
      const project = await readJson<Project | undefined>(path.join(item.originalPath || "", "project.json"), undefined);
      if (!project) throw new Error(`Restored project is missing project.json: ${item.title}`);
      await this.registry.register(project);
      await removeTrashMetadata(this.registry.memoryRoot, item.id);
      return item;
    }

    if (item.type === "repo") {
      if (!item.projectId) throw new Error(`Trash repo item is missing projectId: ${item.id}`);
      const project = await resolveProject(this.registry, item.projectId);
      const repo = await readTrashJsonPayload<RepoLink>(item);
      const result = await linkProjectRepo({
        project,
        repoPath: repo.path,
        role: repo.role,
        name: repo.name,
        description: repo.description,
        defaultBranch: repo.defaultBranch,
        writePointerFile: true
      });
      await this.registry.register(result.project);
      await removeTrashMetadata(this.registry.memoryRoot, item.id);
      return item;
    }

    await restorePathFromTrash(item);
    await removeTrashMetadata(this.registry.memoryRoot, item.id);
    return item;
  }

  async purgeTrashItem(params: { projectId: string; trashItemId: string }) {
    const item = (await storageListTrash(this.registry.memoryRoot)).find((candidate) => candidate.id === params.trashItemId);
    if (!item) throw new Error(`Trash item not found: ${params.trashItemId}`);
    requireProject(item, params.projectId);
    return storagePurgeTrashItem(this.registry.memoryRoot, params.trashItemId);
  }

  async emptyTrash(params: { projectId: string; trashItemIds?: string[] }) {
    const projectItems = (await this.listTrash({ projectId: params.projectId }));
    const allowed = new Set(projectItems.map((item) => item.id));
    const items = params.trashItemIds?.length ? params.trashItemIds : [...allowed];
    if (items.some((id) => !allowed.has(id))) throw new Error("Trash selection crosses project authority.");
    const purged = [];
    for (const trashItemId of items) {
      purged.push(await storagePurgeTrashItem(this.registry.memoryRoot, trashItemId));
    }
    return { purged: purged.length, items: purged };
  }
}

function requireProject(item: { projectId?: string; type: string; itemId: string }, projectId: string): void {
  if (item.projectId !== projectId && !(item.type === "project" && item.itemId === projectId)) {
    throw new Error("Trash item belongs to a different project.");
  }
}
