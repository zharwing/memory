import { type ContextBundle, type MemoryDocument, type Project, type Session } from "@aimem/core";
export interface BuildContextInput {
    project: Project;
    activeSession?: Session;
    recentSessions: Session[];
    documents: MemoryDocument[];
    taskText?: string;
    requestedBy?: string;
}
export declare function buildContextBundle(input: BuildContextInput): ContextBundle;
