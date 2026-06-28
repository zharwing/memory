import { type DocumentType, type DocumentStatus, type MemoryDocument, type Project, type Visibility, type WorkstreamId } from "@aimem/core";
export declare function createDocument(args: {
    project: Project;
    title: string;
    type: DocumentType;
    body: string;
    status?: DocumentStatus;
    visibility?: Visibility;
    folder?: string;
    topics?: string[];
    workstreamIds?: WorkstreamId[];
    relatedFiles?: string[];
}): Promise<MemoryDocument>;
export declare function writeDocument(doc: MemoryDocument): Promise<void>;
export declare function listProjectDocuments(project: Project): Promise<MemoryDocument[]>;
export declare function readDocument(project: Project, filePath: string): Promise<MemoryDocument>;
