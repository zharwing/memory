import type { MemoryDocument, Session } from "@aimem/core";
import type { AiChatMessage } from "./openai-compatible.js";
export interface AssistantDraft {
    title: string;
    patch: string;
    reason: string;
    confidence: "low" | "medium" | "high";
}
export interface SessionSummaryDraft {
    summary: string;
    topics: string[];
    nextSteps: string[];
    blockers: string[];
    touchedFiles: string[];
    confidence: "low" | "medium" | "high";
}
export declare function sessionSummaryMessages(session: Session, content?: string): AiChatMessage[];
export declare function sessionSummaryFromProviderJson(input: unknown, session: Session): SessionSummaryDraft;
export declare function summarizeSessionMetadataDeterministically(session: Session): SessionSummaryDraft;
export declare function summarizeSessionDeterministically(session: Session): AssistantDraft;
export declare function prepareReturnSummaryDeterministically(sessions: Session[]): AssistantDraft;
export declare function classifyDocumentDeterministically(doc: MemoryDocument): AssistantDraft;
