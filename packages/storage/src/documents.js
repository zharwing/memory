import { promises as fs } from "node:fs";
import path from "node:path";
import { createId, filenameSafe, nowIso } from "@aimem/core";
import { listFiles, pathExists, readText, writeText } from "./fs.js";
import { formatMarkdown, parseMarkdown } from "./markdown.js";
export async function createDocument(args) {
    const now = nowIso();
    const folder = args.folder || folderForType(args.type);
    const filePath = path.join(args.project.memoryRoot, folder, `${filenameSafe(args.title)}.md`);
    const doc = {
        id: createId(args.type === "diagram" ? "diagram" : "doc"),
        projectId: args.project.id,
        title: args.title,
        type: args.type,
        status: args.status || "active",
        visibility: args.visibility || args.project.privacyPolicy.defaultVisibility,
        topics: args.topics || [],
        workstreamIds: args.workstreamIds || [],
        relatedTasks: [],
        relatedFiles: args.relatedFiles || [],
        relatedSessions: [],
        relatedDiagrams: [],
        created: now,
        updated: now,
        filePath,
        body: args.body,
        format: "markdown"
    };
    await writeDocument(doc);
    return doc;
}
export async function writeDocument(doc) {
    await writeText(doc.filePath, formatMarkdown({
        id: doc.id,
        title: doc.title,
        type: doc.type,
        status: doc.status,
        visibility: doc.visibility,
        project: doc.projectId,
        topics: doc.topics,
        workstream_ids: doc.workstreamIds,
        related_tasks: doc.relatedTasks,
        related_files: doc.relatedFiles,
        related_sessions: doc.relatedSessions,
        related_diagrams: doc.relatedDiagrams,
        created: doc.created,
        updated: doc.updated,
        last_verified: doc.lastVerified,
        confidence: doc.confidence,
        diagram_type: doc.diagramType,
        format: doc.format,
        import_source_path: doc.importSourcePath,
        import_source_hash: doc.importSourceHash,
        imported_at: doc.importedAt,
        import_profile: doc.importProfile
    }, doc.body));
}
export async function listProjectDocuments(project) {
    const docsRoot = path.join(project.memoryRoot, "docs");
    const topLevel = [
        path.join(project.memoryRoot, "overview.md"),
        path.join(project.memoryRoot, "architecture.md"),
        path.join(project.memoryRoot, "decisions.md"),
        path.join(project.memoryRoot, "tasks.md"),
        path.join(project.memoryRoot, "gotchas.md"),
        path.join(project.memoryRoot, "commands.md"),
        path.join(project.memoryRoot, "glossary.md"),
        path.join(project.memoryRoot, "privacy.md")
    ];
    const existingTopLevel = [];
    for (const file of topLevel) {
        if (await pathExists(file))
            existingTopLevel.push(file);
    }
    const files = [...existingTopLevel, ...(await listFiles(docsRoot, (file) => file.endsWith(".md")))];
    const docs = await Promise.all(files.map((file) => readDocument(project, file)));
    return docs.sort((a, b) => b.updated.localeCompare(a.updated));
}
export async function readDocument(project, filePath) {
    const raw = await readText(filePath);
    const parsed = parseMarkdown(raw);
    const fm = parsed.frontmatter;
    const title = String(fm.title || inferTitle(parsed.body) || path.basename(filePath, ".md"));
    const stat = await fs.stat(filePath);
    const fileUpdated = stat.mtime.toISOString();
    return {
        id: String(fm.id || createId("doc")),
        projectId: String(fm.project || fm.project_id || project.id),
        title,
        type: fm.type || inferType(filePath),
        status: fm.status || "draft",
        visibility: fm.visibility || project.privacyPolicy.defaultVisibility,
        topics: arrayOfStrings(fm.topics),
        workstreamIds: arrayOfStrings(fm.workstream_ids),
        relatedTasks: arrayOfStrings(fm.related_tasks),
        relatedFiles: arrayOfStrings(fm.related_files),
        relatedSessions: arrayOfStrings(fm.related_sessions),
        relatedDiagrams: arrayOfStrings(fm.related_diagrams),
        created: String(fm.created || fileUpdated),
        updated: String(fm.updated || fm.created || fileUpdated),
        lastVerified: stringOrUndefined(fm.last_verified),
        confidence: fm.confidence,
        filePath,
        body: parsed.body,
        diagramType: stringOrUndefined(fm.diagram_type),
        format: fm.format || "markdown",
        importSourcePath: stringOrUndefined(fm.import_source_path),
        importSourceHash: stringOrUndefined(fm.import_source_hash),
        importedAt: stringOrUndefined(fm.imported_at),
        importProfile: stringOrUndefined(fm.import_profile)
    };
}
function folderForType(type) {
    const mapping = {
        plan: "docs/plans",
        investigation: "docs/investigations",
        research: "docs/research",
        "architecture-note": "docs/architecture",
        "decision-record": "docs/decisions",
        "architecture-decision-record": "docs/decisions",
        "design-requirements-document": "docs/requirements",
        "technical-spec": "docs/specs",
        requirement: "docs/requirements",
        "user-flow": "docs/user-flows",
        diagram: "docs/diagrams",
        "command-note": "docs/notes",
        gotcha: "docs/notes",
        "meeting-note": "docs/notes",
        "external-reference": "docs/references",
        "scratch-note": "docs/notes"
    };
    return mapping[type] || "docs/notes";
}
function inferTitle(body) {
    const match = /^#\s+(.+)$/m.exec(body);
    return match?.[1];
}
function inferType(filePath) {
    const normalized = filePath.replace(/\\/g, "/").toLowerCase();
    const basename = path.posix.basename(normalized);
    if (normalized.includes("/diagrams/"))
        return "diagram";
    if (basename === "overview.md")
        return "overview";
    if (basename === "architecture.md")
        return "architecture-note";
    if (basename === "decisions.md")
        return "decision-record";
    if (basename === "tasks.md")
        return "plan";
    if (basename === "gotchas.md")
        return "gotcha";
    if (basename === "commands.md")
        return "commands";
    if (basename === "glossary.md")
        return "glossary";
    if (basename === "privacy.md")
        return "privacy";
    return "scratch-note";
}
function arrayOfStrings(input) {
    return Array.isArray(input) ? input.map(String).filter(Boolean) : [];
}
function stringOrUndefined(input) {
    const value = String(input || "");
    return value ? value : undefined;
}
//# sourceMappingURL=documents.js.map