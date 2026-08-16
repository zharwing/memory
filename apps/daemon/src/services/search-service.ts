import { searchProjectMemory } from "@zharwing/memory-search";
import type { DocumentRepository, ProjectRegistry, SessionRepository } from "@zharwing/memory-store";
import {
  listProjectWorkstreams,
  listProposedUpdates
} from "@zharwing/memory-store";
import { resolveProject } from "./project-resolver.js";
import { SessionAuthorityStore } from "./session-visibility.js";

export class SearchService {
  constructor(
    private readonly registry: ProjectRegistry,
    private readonly sessionAuthority: SessionAuthorityStore,
    private readonly documents: Pick<DocumentRepository, "list">,
    private readonly sessions: SessionRepository
  ) {}

  async search(params: { projectId: string; query: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const workstreams = await listProjectWorkstreams(project);
    const sessions = await this.sessionAuthority.applyVisibilities(
      project,
      await this.sessions.listProjectSessions(project)
    );
    const documents = await this.documents.list(project);
    const proposals = await listProposedUpdates(project);
    const sources = [
      ...workstreams.map((item) => ({ key: searchEntityKey("workstream", item.id), visibility: item.visibility })),
      ...sessions.map((item) => ({ key: searchEntityKey("session", item.id), visibility: item.visibility })),
      ...documents.map((item) => ({ key: searchEntityKey("document", item.id), visibility: item.visibility })),
      ...proposals.map((item) => ({ key: searchEntityKey("proposed-update", item.id), visibility: item.visibility }))
    ];
    const ownerCounts = new Map<string, number>();
    const visibility = new Map<string, (typeof sessions)[number]["visibility"]>();
    for (const source of sources) {
      ownerCounts.set(source.key, (ownerCounts.get(source.key) ?? 0) + 1);
      visibility.set(source.key, source.visibility);
    }
    return searchProjectMemory({
      projectId: project.id,
      workstreams,
      sessions,
      documents,
      proposals
    }, params.query).map((result) => {
      const key = searchEntityKey(result.type, result.id);
      const sourceVisibility = ownerCounts.get(key) === 1 ? visibility.get(key) : undefined;
      const { visibility: _untrustedVisibility, ...publicResult } = result;
      return {
        ...publicResult,
        ...(sourceVisibility ? { visibility: sourceVisibility } : {})
      };
    });
  }
}

function searchEntityKey(type: string, id: string): string {
  return `${type}\u0000${id}`;
}
