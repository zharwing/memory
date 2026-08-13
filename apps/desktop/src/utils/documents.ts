import {
  CANONICAL_PROJECT_FILES,
  type MemoryDocument,
  type SearchResult
} from "@zharwing/memory-core";

// Markdown starter files only; project.json is metadata, not a document.
const STARTER_DOC_FILE_NAMES = CANONICAL_PROJECT_FILES
  .filter((file) => file.markdown)
  .map((file) => file.name);

export function filterDocuments(docs: readonly MemoryDocument[], filter: string): readonly MemoryDocument[] {
  if (filter === "imported") return docs.filter((doc) => Boolean(doc.importSourcePath || doc.importProfile));
  if (filter === "draft") return docs.filter((doc) => doc.status === "draft");
  return docs;
}

export function isStarterDraftDoc(doc: MemoryDocument): boolean {
  if (doc.status !== "draft" || doc.importSourcePath || doc.importProfile) return false;
  const normalizedPath = String(doc.filePath || "").replace(/\\/g, "/").toLowerCase();
  return STARTER_DOC_FILE_NAMES.some((name) => normalizedPath.endsWith(`/${name}`) || normalizedPath.endsWith(name));
}

export function findDocumentForSearchResult(
  docs: readonly MemoryDocument[],
  result: SearchResult | undefined
): MemoryDocument | undefined {
  if (!result || result.type !== "document") return undefined;
  const idMatch = docs.find((doc) => doc.id === result.id);
  if (idMatch) return idMatch;

  // Legacy and starter Markdown files may not have a persisted frontmatter ID.
  // Separate list/search reads can therefore synthesize different IDs for the
  // same file. The daemon-provided project/path pair is the stable fallback.
  const resultPath = normalizeDocumentPath(result.path);
  if (!resultPath) return undefined;
  return docs.find((doc) => (
    doc.projectId === result.projectId &&
    normalizeDocumentPath(doc.filePath) === resultPath
  ));
}

function normalizeDocumentPath(value: string | undefined): string {
  return String(value || "").replace(/\\/g, "/");
}
