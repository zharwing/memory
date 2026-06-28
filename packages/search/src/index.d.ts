import type { ContextBundle, MemoryDocument, ProjectId, ProposedMemoryUpdate, SearchResult, Session, Workstream } from "@aimem/core";
export interface SearchCorpus {
    projectId: ProjectId;
    sessions: Session[];
    documents: MemoryDocument[];
    proposals: ProposedMemoryUpdate[];
    workstreams?: Workstream[];
    bundles?: ContextBundle[];
}
export declare function searchProjectMemory(corpus: SearchCorpus, query: string): SearchResult[];
