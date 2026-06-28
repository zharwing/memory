import type { MemoryDocument, Session } from "@aimem/core";
export declare function scoreDocumentRelevance(doc: MemoryDocument, query: string, activeSession?: Session): number;
export declare function scoreSessionRelevance(session: Session, query: string, activeSession?: Session): number;
