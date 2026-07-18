import { searchProjectMemory } from "@zharwing/memory-search";
import type { ProjectRegistry } from "@zharwing/memory-store";
import {
  listProjectDocuments,
  listProjectSessions,
  listProjectWorkstreams,
  listProposedUpdates
} from "@zharwing/memory-store";
import { resolveProject } from "./project-resolver.js";

export class SearchService {
  constructor(private readonly registry: ProjectRegistry) {}

  async search(params: { projectId: string; query: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    return searchProjectMemory({
      projectId: project.id,
      workstreams: await listProjectWorkstreams(project),
      sessions: await listProjectSessions(project),
      documents: await listProjectDocuments(project),
      proposals: await listProposedUpdates(project)
    }, params.query);
  }
}
