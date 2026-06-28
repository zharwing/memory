import { type Project, type Session, type SessionId, type WorkstreamId } from "@aimem/core";
export declare function startSession(args: {
    project: Project;
    repoPath: string;
    workingDirectory: string;
    branch?: string;
    agent?: string;
    client?: string;
    taskTitle?: string;
    goal?: string;
    workstreamIds?: WorkstreamId[];
}): Promise<Session>;
export declare function writeSession(session: Session, body?: string): Promise<void>;
export declare function listProjectSessions(project: Project): Promise<Session[]>;
export declare function getSession(project: Project, sessionId: SessionId): Promise<Session | undefined>;
export declare function getActiveSession(project: Project): Promise<Session | undefined>;
export declare function getLatestSession(project: Project): Promise<Session | undefined>;
export declare function saveCheckpoint(args: {
    project: Project;
    sessionId: SessionId;
    summary: string;
    nextSteps?: string[];
    blockers?: string[];
    touchedFiles?: string[];
    proposedUpdateIds?: string[];
}): Promise<Session>;
export declare function closeSession(args: {
    project: Project;
    sessionId: SessionId;
    summary?: string;
    nextSteps?: string[];
}): Promise<Session>;
export declare function readSession(filePath: string): Promise<Session>;
