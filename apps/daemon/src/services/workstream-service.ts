import type { ProjectRegistry } from "@zharwing/memory-store";
import {
  createWorkstream as storageCreateWorkstream,
  getWorkstreamDetail as storageGetWorkstreamDetail,
  listProjectWorkstreams,
  movePathToTrash,
  updateWorkstreamStatus as storageUpdateWorkstreamStatus
} from "@zharwing/memory-store";
import { resolveProject } from "./project-resolver.js";

export class WorkstreamService {
  constructor(private readonly registry: ProjectRegistry) {}

  async listWorkstreams(params: { projectId: string }) {
    return listProjectWorkstreams(await resolveProject(this.registry, params.projectId));
  }

  async createWorkstream(params: {
    projectId: string;
    name: string;
    summary?: string;
    goal?: string;
    topics?: string[];
    repoRoles?: string[];
    relatedTasks?: string[];
    relatedFiles?: string[];
    body?: string;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    return storageCreateWorkstream({
      project,
      name: params.name,
      summary: params.summary,
      goal: params.goal,
      topics: params.topics,
      repoRoles: params.repoRoles,
      relatedTasks: params.relatedTasks,
      relatedFiles: params.relatedFiles,
      body: params.body
    });
  }

  async getWorkstreamDetail(params: { projectId: string; workstreamId: string }) {
    return storageGetWorkstreamDetail(await resolveProject(this.registry, params.projectId), params.workstreamId);
  }

  async updateWorkstreamStatus(params: {
    projectId: string;
    workstreamId: string;
    status: Parameters<typeof storageUpdateWorkstreamStatus>[0]["status"];
  }) {
    return storageUpdateWorkstreamStatus({
      project: await resolveProject(this.registry, params.projectId),
      workstreamId: params.workstreamId,
      status: params.status
    });
  }

  async deleteWorkstream(params: { projectId: string; workstreamId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const detail = await storageGetWorkstreamDetail(project, params.workstreamId);
    if (!detail.workstream.filePath) throw new Error(`Workstream has no file path: ${params.workstreamId}`);
    return movePathToTrash({
      memoryRoot: this.registry.memoryRoot,
      type: "workstream",
      projectId: project.id,
      projectName: project.name,
      itemId: detail.workstream.id,
      title: detail.workstream.name,
      originalPath: detail.workstream.filePath,
      critical: false
    });
  }
}
