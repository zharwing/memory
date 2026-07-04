import { buildProjectGraph } from "@aimem/graph";
import type { ProjectRegistry } from "@aimem/storage";
import {
  listProjectDocuments,
  listProjectSessions,
  listProjectWorkstreams
} from "@aimem/storage";
import { resolveProject } from "./project-resolver.js";

export class GraphService {
  constructor(private readonly registry: ProjectRegistry) {}

  async getGraph(params: { projectId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    return buildProjectGraph({
      project,
      workstreams: await listProjectWorkstreams(project),
      sessions: await listProjectSessions(project),
      documents: await listProjectDocuments(project)
    });
  }
}
