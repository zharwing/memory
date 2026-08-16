import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CANONICAL_PROJECT_FILES,
  filenameSafe,
  nowIso,
  parseDocumentId,
  type DocumentStatus,
  type DocumentType,
  type MemoryDocument,
  type Project,
  type TrashItem,
  type Visibility,
  type WorkstreamId
} from "@zharwing/memory-core";
import { ensureDir, listFiles, pathExists, writeText } from "../fs.js";
import { parseMarkdown, formatMarkdown } from "../markdown.js";
import {
  createStoredDocumentIdentity,
  deriveLegacyDocumentId,
  normalizedDocumentRelativePath
} from "../document-identity.js";
import { materializeDocumentId, readRawDocumentMarkdown } from "../document-markdown.js";

export interface DocumentCreateArgs {
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
}

export class DocumentRepository {
  async create(args: DocumentCreateArgs): Promise<MemoryDocument> {
    const now = nowIso();
    const folder = args.folder || folderForType(args.type);
    const basePath = path.join(args.project.memoryRoot, folder, `${filenameSafe(args.title)}.md`);
    // A same-title document is never an overwrite. The deterministic suffix is
    // stable for sequential creates and keeps the original collision readable.
    const filePath = await uniqueDocumentFilePath(basePath);
    const document: MemoryDocument = {
      id: createStoredDocumentIdentity(args.type === "diagram" ? "diagram" : "doc"),
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
    await this.save(document, args.project);
    return document;
  }

  async list(project: Project): Promise<MemoryDocument[]> {
    const top = CANONICAL_PROJECT_FILES
      .filter((file) => file.markdown)
      .map((file) => path.join(project.memoryRoot, file.name));
    const existing: string[] = [];
    for (const file of top) if (await pathExists(file)) existing.push(file);
    const files = [...existing, ...(await listFiles(path.join(project.memoryRoot, "docs"), (file) => file.endsWith(".md")))];
    return (await Promise.all(files.map((file) => this.read(project, file))))
      .sort((a, b) => b.updated.localeCompare(a.updated));
  }

  async read(project: Project, filePath: string): Promise<MemoryDocument> {
    const raw = await readRawDocumentMarkdown(filePath);
    const parsed = parseMarkdown(raw.raw);
    const fm = parsed.frontmatter;
    const stat = await fs.stat(filePath);
    const updated = stat.mtime.toISOString();
    const storedId = raw.id === undefined || raw.id.trim() === ""
      ? undefined
      : parseDocumentId(raw.id);
    if (raw.id !== undefined && raw.id.trim() !== "" && !storedId) {
      throw new Error("Document contains an invalid stored identity.");
    }
    return {
      id: storedId ?? deriveLegacyDocumentId(project, filePath),
      projectId: String(fm.project || fm.project_id || project.id),
      title: String(fm.title || inferTitle(parsed.body) || path.basename(filePath, ".md")),
      type: (fm.type as DocumentType) || inferType(filePath),
      status: (fm.status as MemoryDocument["status"]) || "draft",
      visibility: (fm.visibility as Visibility) || project.privacyPolicy.defaultVisibility,
      topics: strings(fm.topics),
      workstreamIds: strings(fm.workstream_ids),
      relatedTasks: strings(fm.related_tasks),
      relatedFiles: strings(fm.related_files),
      relatedSessions: strings(fm.related_sessions),
      relatedDiagrams: strings(fm.related_diagrams),
      created: String(fm.created || updated),
      updated: String(fm.updated || fm.created || updated),
      lastVerified: stringOrUndefined(fm.last_verified),
      confidence: fm.confidence as MemoryDocument["confidence"],
      filePath,
      body: parsed.body,
      diagramType: stringOrUndefined(fm.diagram_type),
      format: (fm.format as MemoryDocument["format"]) || "markdown",
      importSourcePath: stringOrUndefined(fm.import_source_path),
      importSourceHash: stringOrUndefined(fm.import_source_hash),
      importedAt: stringOrUndefined(fm.imported_at),
      importProfile: stringOrUndefined(fm.import_profile)
    };
  }

  async findById(project: Project, id: string): Promise<MemoryDocument | undefined> {
    return (await this.list(project)).find((document) => document.id === id);
  }

  async save(document: MemoryDocument, project?: Project): Promise<void> {
    if (project) {
      if (document.projectId !== project.id) {
        throw new Error("Document project identity does not match its repository owner.");
      }
      normalizedDocumentRelativePath(project, document.filePath);
    }
    let durableId = document.id;
    let existingRaw: Awaited<ReturnType<typeof readRawDocumentMarkdown>> | undefined;
    if (await pathExists(document.filePath)) {
      existingRaw = await readRawDocumentMarkdown(document.filePath);
      if (existingRaw.idFieldCount > 1) {
        throw new Error("Document contains duplicate top-level id fields.");
      }
      if (existingRaw.idFieldCount === 1) {
        if (!existingRaw.id?.trim()) throw new Error("Document contains a blank durable identity.");
        const parsed = parseDocumentId(existingRaw.id);
        if (!parsed) throw new Error("Document contains an invalid durable identity.");
        durableId = parsed;
      } else if (project) {
        durableId = deriveLegacyDocumentId(project, document.filePath);
      }
    }
    const fields: Record<string, string | string[] | number | boolean | undefined> = {
      id: durableId,
      title: document.title,
      type: document.type,
      status: document.status,
      visibility: document.visibility,
      project: document.projectId,
      topics: document.topics,
      workstream_ids: document.workstreamIds,
      related_tasks: document.relatedTasks,
      related_files: document.relatedFiles,
      related_sessions: document.relatedSessions,
      related_diagrams: document.relatedDiagrams,
      created: document.created,
      updated: document.updated,
      last_verified: document.lastVerified,
      confidence: document.confidence,
      diagram_type: document.diagramType,
      format: document.format,
      import_source_path: document.importSourcePath,
      import_source_hash: document.importSourceHash,
      imported_at: document.importedAt,
      import_profile: document.importProfile
    };
    if (!existingRaw) {
      await writeText(document.filePath, formatMarkdown(fields, document.body));
      return;
    }
    await writeText(document.filePath, patchOwnedDocumentMarkdown(existingRaw.raw, fields, document.body));
  }

  async materializeIdentity(project: Project, filePath: string): Promise<{ document: MemoryDocument; changed: boolean }> {
    const raw = await readRawDocumentMarkdown(filePath);
    const document = await this.read(project, filePath);
    if (raw.idFieldCount > 1) throw new Error("Document contains duplicate top-level id fields.");
    if (raw.idFieldCount === 1) {
      if (!raw.id?.trim()) throw new Error("Document contains a blank durable identity.");
      if (!parseDocumentId(raw.id)) throw new Error("Document contains an invalid durable identity.");
      return { document, changed: false };
    }
    await writeText(filePath, materializeDocumentId(raw, document.id));
    return { document, changed: true };
  }

  async snapshotIdentities(project: Project): Promise<Array<{
    id: string;
    relativePath: string;
    materialized: boolean;
  }>> {
    const documents = await this.list(project);
    return Promise.all(documents.map(async (document) => {
      const raw = await readRawDocumentMarkdown(document.filePath);
      return {
        id: document.id,
        relativePath: normalizedDocumentRelativePath(project, document.filePath),
        materialized: raw.idFieldCount === 1 && Boolean(raw.id?.trim())
      };
    }));
  }

  async restoreFromTrash(project: Project, item: TrashItem): Promise<void> {
    if (item.type !== "document" || !item.payloadPath || !item.originalPath) {
      throw new Error("Trash item is not a restorable document.");
    }
    normalizedDocumentRelativePath(project, item.originalPath);
    if (await pathExists(item.originalPath)) {
      throw new Error(`Cannot restore; target already exists: ${item.originalPath}`);
    }
    const raw = await readRawDocumentMarkdown(item.payloadPath);
    if (raw.idFieldCount > 1) {
      throw new Error("Trashed document contains duplicate top-level id fields.");
    }
    const resolvedId = raw.idFieldCount === 1
      ? raw.id && parseDocumentId(raw.id)
      : deriveLegacyDocumentId(project, item.originalPath);
    if (!resolvedId || resolvedId !== item.itemId) {
      throw new Error("Trashed document identity does not match its restore target.");
    }
    await ensureDir(path.dirname(item.originalPath));
    await fs.rename(item.payloadPath, item.originalPath);
  }

  dispose(): void {
    // Repository currently owns no background resources; keep disposal explicit
    // so composition roots can treat storage and session owners uniformly.
  }
}

async function uniqueDocumentFilePath(filePath: string): Promise<string> {
  if (!(await pathExists(filePath))) return filePath;
  const extension = path.extname(filePath);
  const base = filePath.slice(0, -extension.length);
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${base}-${index}${extension}`;
    if (!(await pathExists(candidate))) return candidate;
  }
  throw new Error("Could not allocate a collision-safe document path.");
}

function folderForType(type: DocumentType): string {
  return ({
    plan: "docs/plans", investigation: "docs/investigations", research: "docs/research",
    "architecture-note": "docs/architecture", "decision-record": "docs/decisions",
    "architecture-decision-record": "docs/decisions", "design-requirements-document": "docs/requirements",
    "technical-spec": "docs/specs", requirement: "docs/requirements", "user-flow": "docs/user-flows",
    diagram: "docs/diagrams", "command-note": "docs/notes", gotcha: "docs/notes",
    "meeting-note": "docs/notes", "external-reference": "docs/references", "scratch-note": "docs/notes"
  } as Partial<Record<DocumentType, string>>)[type] || "docs/notes";
}

function inferTitle(body: string): string | undefined { return /^#\s+(.+)$/m.exec(body)?.[1]; }
function inferType(filePath: string): DocumentType {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  const basename = path.posix.basename(normalized);
  if (normalized.includes("/diagrams/")) return "diagram";
  return CANONICAL_PROJECT_FILES.find((file) => file.name === basename)?.documentType || "scratch-note";
}
function strings(value: unknown): string[] { return Array.isArray(value) ? value.map(String).filter(Boolean) : []; }
function stringOrUndefined(value: unknown): string | undefined { return value === undefined || value === null || value === "" ? undefined : String(value); }

function patchOwnedDocumentMarkdown(raw: string, fields: Record<string, string | string[] | number | boolean | undefined>, body: string): string {
  const bom = raw.startsWith("\uFEFF") ? "\uFEFF" : "";
  const text = bom ? raw.slice(1) : raw;
  const inspected = readFrontmatterLines(text);
  if (!inspected) {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const frontmatter = formatMarkdown(fields, "").replace(/\n/g, eol);
    return `${bom}${frontmatter}${body}`;
  }

  const { eol, opening, closing, lines } = inspected;
  const rendered = new Set<string>();
  const next: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const key = /^([A-Za-z0-9_-]+):(?:\s|$)/.exec(line)?.[1];
    if (!key || !(key in fields)) {
      next.push(line);
      continue;
    }
    if (!rendered.has(key)) {
      next.push(...renderYamlField(key, fields[key], eol));
      rendered.add(key);
    }
    // Remove only the old value's continuation syntax. Comments and blank
    // separators are not owned data, so retain them byte-for-byte and in the
    // same relative position. This also prevents an old list/block scalar
    // from surviving under the newly rendered value.
    while (index + 1 < lines.length && !/^([A-Za-z0-9_-]+):(?:\s|$)/.test(lines[index + 1]!)) {
      const continuation = lines[index + 1]!;
      if (continuation.trim() === "" || /^\s*#/.test(continuation)) next.push(continuation);
      index += 1;
    }
  }
  for (const [key, value] of Object.entries(fields)) {
    if (!rendered.has(key) && value !== undefined) next.push(...renderYamlField(key, value, eol));
  }
  return `${bom}${opening}${eol}${next.join(eol)}${eol}${closing}${eol}${body}`;
}

function readFrontmatterLines(text: string): { eol: "\n" | "\r\n"; opening: string; closing: string; lines: string[] } | undefined {
  const openingMatch = /^---(\r\n|\n|$)/.exec(text);
  if (!openingMatch) return undefined;
  const eol = openingMatch[1] === "\r\n" ? "\r\n" : "\n";
  const start = openingMatch[0].length;
  let cursor = start;
  while (cursor <= text.length) {
    const end = text.indexOf("\n", cursor);
    const lineEnd = end === -1 ? text.length : end;
    const line = text.slice(cursor, lineEnd).replace(/\r$/, "");
    if (line === "---") return { eol, opening: "---", closing: "---", lines: text.slice(start, cursor).split(/\r?\n/).filter((item, i, all) => !(i === all.length - 1 && item === "")) };
    cursor = end === -1 ? text.length + 1 : end + 1;
  }
  return undefined;
}

function renderYamlField(key: string, value: string | string[] | number | boolean | undefined, _eol: string): string[] {
  if (Array.isArray(value)) return value.length ? [key + ":", ...value.map((item) => `  - ${quote(String(item))}`)] : [`${key}: []`];
  return [`${key}: ${value === undefined ? "" : quote(String(value))}`];
}
function quote(value: string): string { return /^[A-Za-z0-9_.:/\\ -]+$/.test(value) ? value : JSON.stringify(value); }
