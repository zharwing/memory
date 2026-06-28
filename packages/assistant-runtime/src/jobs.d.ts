import type { MemoryDocument, Session } from "@aimem/core";
export interface AssistantDraft {
    title: string;
    patch: string;
    reason: string;
    confidence: "low" | "medium" | "high";
}
export declare function summarizeSessionDeterministically(session: Session): AssistantDraft;
export declare function prepareReturnSummaryDeterministically(sessions: Session[]): AssistantDraft;
export declare function classifyDocumentDeterministically(doc: MemoryDocument): AssistantDraft;
