import { CANONICAL_PROJECT_FILES } from "@zharwing/memory-core";

// Markdown starter files only; project.json is metadata, not a document.
const STARTER_DOC_FILE_NAMES = CANONICAL_PROJECT_FILES
  .filter((file) => file.markdown)
  .map((file) => file.name);

export function filterDocuments(docs: any[], filter: string): any[] {
  if (filter === "imported") return docs.filter((doc) => Boolean(doc.importSourcePath || doc.importProfile));
  if (filter === "draft") return docs.filter((doc) => doc.status === "draft");
  return docs;
}

export function isStarterDraftDoc(doc: any): boolean {
  if (doc.status !== "draft" || doc.importSourcePath || doc.importProfile) return false;
  const normalizedPath = String(doc.filePath || "").replace(/\\/g, "/").toLowerCase();
  return STARTER_DOC_FILE_NAMES.some((name) => normalizedPath.endsWith(`/${name}`) || normalizedPath.endsWith(name));
}
