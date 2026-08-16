import type {
  DocumentStatus,
  DocumentType,
  MemoryDocument,
  Project,
  TrashItem,
  Visibility,
  WorkstreamId
} from "@zharwing/memory-core";
import { DocumentRepository } from "./repositories/document-repository.js";

/** @deprecated Compatibility facade; DocumentRepository is the single document persistence owner. */
const defaultDocumentRepository = new DocumentRepository();
export function getDocumentRepository() { return defaultDocumentRepository; }
export async function createDocument(args: { project: Project; title: string; type: DocumentType; body: string; status?: DocumentStatus; visibility?: Visibility; folder?: string; topics?: string[]; workstreamIds?: WorkstreamId[]; relatedFiles?: string[] }) { return defaultDocumentRepository.create(args); }
export async function writeDocument(document: MemoryDocument, project?: Project) { return defaultDocumentRepository.save(document, project); }
export async function listProjectDocuments(project: Project) { return defaultDocumentRepository.list(project); }
export async function readDocument(project: Project, filePath: string) { return defaultDocumentRepository.read(project, filePath); }
export async function findProjectDocument(project: Project, documentId: string) { return defaultDocumentRepository.findById(project, documentId); }
export async function materializeDocumentIdentity(project: Project, filePath: string) { return defaultDocumentRepository.materializeIdentity(project, filePath); }
export async function restoreDocumentFromTrash(project: Project, item: TrashItem) { return defaultDocumentRepository.restoreFromTrash(project, item); }
