import { type MemoryDocument, type Project, type RepoLink, type Session, type Workstream, type WorkstreamDetail, type WorkstreamId, type WorkstreamStatus } from "@aimem/core";
export declare function createWorkstream(args: {
    project: Project;
    name: string;
    summary?: string;
    goal?: string;
    topics?: string[];
    repoRoles?: RepoLink["role"][];
    relatedTasks?: string[];
    relatedFiles?: string[];
    body?: string;
}): Promise<Workstream>;
export declare function writeWorkstream(workstream: Workstream): Promise<void>;
export declare function listProjectWorkstreams(project: Project): Promise<Workstream[]>;
export declare function getWorkstream(project: Project, workstreamId: WorkstreamId): Promise<Workstream | undefined>;
export declare function getWorkstreamDetail(project: Project, workstreamId: WorkstreamId): Promise<WorkstreamDetail>;
export declare function updateWorkstreamStatus(args: {
    project: Project;
    workstreamId: WorkstreamId;
    status: WorkstreamStatus;
}): Promise<Workstream>;
export declare function readWorkstream(project: Project, filePath: string): Promise<Workstream>;
export declare function sessionMatchesWorkstream(session: Session, workstream: Workstream): boolean;
export declare function documentMatchesWorkstream(doc: MemoryDocument, workstream: Workstream): boolean;
