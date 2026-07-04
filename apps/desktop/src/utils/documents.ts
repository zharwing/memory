export function filterDocuments(docs: any[], filter: string): any[] {
  if (filter === "imported") return docs.filter((doc) => Boolean(doc.importSourcePath || doc.importProfile));
  if (filter === "draft") return docs.filter((doc) => doc.status === "draft");
  return docs;
}

export function isStarterDraftDoc(doc: any): boolean {
  if (doc.status !== "draft" || doc.importSourcePath || doc.importProfile) return false;
  const normalizedPath = String(doc.filePath || "").replace(/\\/g, "/").toLowerCase();
  return [
    "overview.md",
    "architecture.md",
    "decisions.md",
    "tasks.md",
    "gotchas.md",
    "commands.md",
    "glossary.md",
    "privacy.md"
  ].some((name) => normalizedPath.endsWith(`/${name}`) || normalizedPath.endsWith(name));
}
