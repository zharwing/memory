import { type MemoryDocument, type Project, type ProjectGraph, type Session, type Workstream } from "@aimem/core";
export interface BuildGraphInput {
    project: Project;
    sessions: Session[];
    documents: MemoryDocument[];
    workstreams?: Workstream[];
}
export declare function buildProjectGraph(input: BuildGraphInput): ProjectGraph;
