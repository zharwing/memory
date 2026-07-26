import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createId,
  filenameSafe,
  matchesAnyPattern,
  matchesPattern,
  nowIso,
  truncate,
  unique,
  type DocumentStatus,
  type DocumentType,
  type ImportCandidate,
  type ImportCommitResult,
  type ImportConflictStrategy,
  type ImportItemKind,
  type ImportPlan,
  type ImportProfile,
  type MemoryDocument,
  type Project,
  type Session,
  type Visibility
} from "@zharwing/memory-core";
import { pathExists, readText } from "./fs.js";
import { parseMarkdown } from "./markdown.js";
import { writeDocument } from "./documents.js";
import { writeSession } from "./sessions.js";

const MARKDOWN_INCLUDE = ["**/*.md", "**/*.txt"];
const COMMON_EXCLUDES = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.DS_Store",
  "**/*.zip",
  "**/*.7z",
  "**/*.tar",
  "**/*.gz",
  "**/*.png",
  "**/*.jpg",
  "**/*.jpeg",
  "**/*.gif",
  "**/*.webp",
  "**/*.pdf",
  "**/*.codex"
];

const DOCUMENT_STATUSES: DocumentStatus[] = ["draft", "active", "accepted", "superseded", "stale", "archived"];
const VISIBILITIES: Visibility[] = ["ai-eligible", "ai-pinned", "human-only", "private", "never-send"];
const DOCUMENT_FORMATS: Array<NonNullable<MemoryDocument["format"]>> = [
  "markdown",
  "mermaid",
  "plantuml",
  "image",
  "text"
];
const DOCUMENT_TYPES: DocumentType[] = [
  "plan",
  "investigation",
  "research",
  "architecture-note",
  "decision-record",
  "architecture-decision-record",
  "design-requirements-document",
  "technical-spec",
  "requirement",
  "user-flow",
  "diagram",
  "command-note",
  "gotcha",
  "meeting-note",
  "external-reference",
  "scratch-note",
  "overview",
  "commands",
  "glossary",
  "privacy"
];

export function builtinImportProfiles(): ImportProfile[] {
  return [
    {
      name: "generic-markdown",
      description: "Import Markdown and text files as general memory documents.",
      include: MARKDOWN_INCLUDE,
      exclude: COMMON_EXCLUDES,
      defaultKind: "document",
      defaultDocumentType: "scratch-note",
      defaultDocumentStatus: "active",
      defaultSessionStatus: "closed",
      defaultVisibility: "ai-eligible",
      preserveRawBody: true,
      topicsFromPath: true,
      pathRules: commonDocumentRules()
    },
    {
      name: "markdown-memory",
      description: "Import an existing Markdown memory folder as project documents.",
      include: MARKDOWN_INCLUDE,
      exclude: COMMON_EXCLUDES,
      defaultKind: "document",
      defaultDocumentType: "scratch-note",
      defaultDocumentStatus: "active",
      defaultSessionStatus: "closed",
      defaultVisibility: "ai-eligible",
      preserveRawBody: true,
      topicsFromPath: true,
      pathRules: commonDocumentRules()
    },
    {
      name: "markdown-sessions",
      description: "Import an existing Markdown session folder as closed session history.",
      include: MARKDOWN_INCLUDE,
      exclude: COMMON_EXCLUDES,
      defaultKind: "session",
      defaultDocumentType: "investigation",
      defaultDocumentStatus: "active",
      defaultSessionStatus: "closed",
      defaultVisibility: "ai-eligible",
      preserveRawBody: true,
      topicsFromPath: true,
      pathRules: []
    },
    {
      name: "workspace-markdown",
      description: "Import mixed Markdown workspaces, treating session-like paths as sessions and other files as documents.",
      include: MARKDOWN_INCLUDE,
      exclude: COMMON_EXCLUDES,
      defaultKind: "document",
      defaultDocumentType: "scratch-note",
      defaultDocumentStatus: "active",
      defaultSessionStatus: "closed",
      defaultVisibility: "ai-eligible",
      preserveRawBody: true,
      topicsFromPath: true,
      pathRules: [
        { match: "**/sessions/**", kind: "session" },
        { match: "**/session/**", kind: "session" },
        { match: "**/*session*.md", kind: "session" },
        ...commonDocumentRules()
      ]
    }
  ];
}

export function resolveImportProfile(profile?: string | ImportProfile): ImportProfile {
  if (!profile) return builtinImportProfiles()[0];
  if (typeof profile !== "string") return profile;

  const builtin = builtinImportProfiles().find((candidate) => candidate.name === profile);
  if (!builtin) {
    throw new Error(`Unknown import profile: ${profile}`);
  }
  return builtin;
}

export async function prepareImportPlan(args: {
  project: Project;
  sourceRoot: string;
  profile?: string | ImportProfile;
  limit?: number;
}): Promise<ImportPlan> {
  const profile = resolveImportProfile(args.profile);
  const sourceRoot = resolveInputPath(args.sourceRoot);
  if (!(await pathExists(sourceRoot))) {
    throw new Error(`Import source does not exist: ${args.sourceRoot}`);
  }

  const files = await walkImportFiles(sourceRoot, profile);
  const limitedFiles = args.limit ? files.slice(0, args.limit) : files;
  const candidates = await Promise.all(
    limitedFiles.map((filePath) => createCandidate({ project: args.project, sourceRoot, filePath, profile }))
  );

  return {
    id: createId("import"),
    projectId: args.project.id,
    sourceRoot,
    profileName: profile.name,
    created: nowIso(),
    candidates,
    counts: {
      total: candidates.length,
      documents: candidates.filter((candidate) => candidate.kind === "document").length,
      sessions: candidates.filter((candidate) => candidate.kind === "session").length,
      skipped: candidates.filter((candidate) => candidate.kind === "skip").length,
      warnings: candidates.reduce((count, candidate) => count + candidate.warnings.length, 0)
    }
  };
}

export async function commitImportPlan(args: {
  project: Project;
  plan?: ImportPlan;
  sourceRoot?: string;
  profile?: string | ImportProfile;
  conflictStrategy?: ImportConflictStrategy;
  limit?: number;
}): Promise<ImportCommitResult> {
  const plan =
    args.plan ??
    (await prepareImportPlan({
      project: args.project,
      sourceRoot: requiredSourceRoot(args.sourceRoot),
      profile: args.profile,
      limit: args.limit
    }));
  const strategy = args.conflictStrategy || "skip";

  let documents = 0;
  let sessions = 0;
  let skipped = 0;
  const writtenPaths: string[] = [];

  for (const candidate of plan.candidates) {
    if (candidate.kind === "skip" || !candidate.targetPath) {
      skipped += 1;
      continue;
    }

    const targetPath = await targetForCommit(candidate.targetPath, candidate.sourceHash, strategy);
    if (!targetPath) {
      skipped += 1;
      continue;
    }

    if (candidate.kind === "document") {
      await commitDocument({ project: args.project, plan, candidate, targetPath });
      documents += 1;
    } else if (candidate.kind === "session") {
      await commitSession({ project: args.project, plan, candidate, targetPath });
      sessions += 1;
    }
    writtenPaths.push(targetPath);
  }

  return {
    planId: plan.id,
    projectId: args.project.id,
    committed: documents + sessions,
    documents,
    sessions,
    skipped,
    writtenPaths
  };
}

function commonDocumentRules() {
  return [
    { match: "**/README.md", type: "overview" as const },
    { match: "**/*overview*.md", type: "overview" as const },
    { match: "**/*architecture*.md", type: "architecture-note" as const },
    { match: "**/*decision*.md", type: "decision-record" as const },
    { match: "**/*adr*.md", type: "architecture-decision-record" as const },
    { match: "**/*plan*.md", type: "plan" as const },
    { match: "**/*spec*.md", type: "technical-spec" as const },
    { match: "**/*requirement*.md", type: "requirement" as const },
    { match: "**/*command*.md", type: "command-note" as const },
    { match: "**/*gotcha*.md", type: "gotcha" as const },
    { match: "**/*diagram*.md", type: "diagram" as const },
    { match: "**/diagrams/**", type: "diagram" as const }
  ];
}

async function walkImportFiles(root: string, profile: ImportProfile): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relativePath = normalizeRelative(path.relative(root, fullPath));
      if (entry.isDirectory()) {
        if (!matchesAnyPattern(`${relativePath}/`, profile.exclude)) {
          await walk(fullPath);
        }
        continue;
      }

      if (matchesAnyPattern(relativePath, profile.include) && !matchesAnyPattern(relativePath, profile.exclude)) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  return files.sort();
}

async function createCandidate(args: {
  project: Project;
  sourceRoot: string;
  filePath: string;
  profile: ImportProfile;
}): Promise<ImportCandidate> {
  const raw = stripBom(await readText(args.filePath));
  const parsed = parseMarkdown(raw);
  const stat = await fs.stat(args.filePath);
  const relativePath = normalizeRelative(path.relative(args.sourceRoot, args.filePath));
  const rule = args.profile.pathRules.find((candidate) => matchesPattern(relativePath, candidate.match));
  const kind = rule?.kind || args.profile.defaultKind;
  const title = inferTitle(parsed.frontmatter, parsed.body, relativePath);
  const visibility =
    rule?.visibility || asVisibility(parsed.frontmatter.visibility) || args.profile.defaultVisibility;
  const topics = unique([
    ...arrayOfStrings(parsed.frontmatter.topics),
    ...((rule?.topicsFromPath ?? args.profile.topicsFromPath) ? topicsFromRelativePath(relativePath) : []),
    ...(rule?.topics || [])
  ]);
  const warnings: string[] = [];
  const sourceHash = sha256(raw);
  const targetPath =
    kind === "skip" ? undefined : importedTargetPath(args.project, args.profile, kind, relativePath);

  if (targetPath && (await pathExists(targetPath))) {
    warnings.push(`Target already exists: ${targetPath}`);
  }

  return {
    id: createId("import-item"),
    projectId: args.project.id,
    sourcePath: args.filePath,
    relativePath,
    sourceHash,
    size: stat.size,
    kind,
    title,
    documentType:
      kind === "document"
        ? rule?.type || asDocumentType(parsed.frontmatter.type) || args.profile.defaultDocumentType
        : undefined,
    documentStatus:
      kind === "document"
        ? rule?.status || asDocumentStatus(parsed.frontmatter.status) || args.profile.defaultDocumentStatus
        : undefined,
    sessionStatus:
      kind === "session"
        ? rule?.sessionStatus || args.profile.defaultSessionStatus
        : undefined,
    visibility,
    format:
      kind === "document"
        ? rule?.format || asDocumentFormat(parsed.frontmatter.format) || formatFromPath(relativePath)
        : undefined,
    topics,
    targetPath,
    skippedReason: kind === "skip" ? `Matched skip rule for ${relativePath}` : undefined,
    warnings
  };
}

async function commitDocument(args: {
  project: Project;
  plan: ImportPlan;
  candidate: ImportCandidate;
  targetPath: string;
}): Promise<void> {
  const importedAt = nowIso();
  const raw = stripBom(await readText(args.candidate.sourcePath));
  const parsed = parseMarkdown(raw);
  const created = scalar(parsed.frontmatter.created) || inferDateFromPath(args.candidate.relativePath) || importedAt;
  const doc: MemoryDocument = {
    id: scalar(parsed.frontmatter.id) || createId(args.candidate.documentType === "diagram" ? "diagram" : "doc"),
    projectId: args.project.id,
    title: args.candidate.title,
    type: args.candidate.documentType || "scratch-note",
    status: args.candidate.documentStatus || "active",
    visibility: args.candidate.visibility,
    topics: args.candidate.topics,
    workstreamIds: arrayOfStrings(parsed.frontmatter.workstream_ids),
    relatedTasks: arrayOfStrings(parsed.frontmatter.related_tasks),
    relatedFiles: arrayOfStrings(parsed.frontmatter.related_files),
    relatedSessions: arrayOfStrings(parsed.frontmatter.related_sessions),
    relatedDiagrams: arrayOfStrings(parsed.frontmatter.related_diagrams),
    created,
    updated: scalar(parsed.frontmatter.updated) || created,
    lastVerified: scalar(parsed.frontmatter.last_verified),
    confidence: asConfidence(parsed.frontmatter.confidence),
    filePath: args.targetPath,
    body: importedBody(parsed.body, raw, args.candidate.title),
    diagramType: scalar(parsed.frontmatter.diagram_type),
    format: args.candidate.format || "markdown",
    importSourcePath: args.candidate.sourcePath,
    importSourceHash: args.candidate.sourceHash,
    importedAt,
    importProfile: args.plan.profileName
  };
  await writeDocument(doc);
}

async function commitSession(args: {
  project: Project;
  plan: ImportPlan;
  candidate: ImportCandidate;
  targetPath: string;
}): Promise<void> {
  const importedAt = nowIso();
  const raw = stripBom(await readText(args.candidate.sourcePath));
  const parsed = parseMarkdown(raw);
  const started = scalar(parsed.frontmatter.started) || inferDateFromPath(args.candidate.relativePath) || importedAt;
  const status = args.candidate.sessionStatus || "closed";
  const session: Session = {
    id: scalar(parsed.frontmatter.id) || createId("session"),
    projectId: args.project.id,
    repoPath: scalar(parsed.frontmatter.repo_path) || args.project.repos[0]?.path || args.plan.sourceRoot,
    workingDirectory:
      scalar(parsed.frontmatter.working_directory) || args.project.repos[0]?.path || args.plan.sourceRoot,
    branch: scalar(parsed.frontmatter.branch),
    agent: scalar(parsed.frontmatter.agent) || "import",
    client: scalar(parsed.frontmatter.client) || "zharwing-memory-importer",
    status,
    started,
    updated: scalar(parsed.frontmatter.updated) || scalar(parsed.frontmatter.closed) || started,
    closed: status === "closed" ? scalar(parsed.frontmatter.closed) || scalar(parsed.frontmatter.updated) || started : undefined,
    taskTitle: scalar(parsed.frontmatter.task_title) || args.candidate.title,
    includeInGraph: false,
    goal: scalar(parsed.frontmatter.goal),
    summary: scalar(parsed.frontmatter.summary) || inferSummary(parsed.body),
    topics: arrayOfStrings(parsed.frontmatter.topics),
    summaryGeneratedAt: scalar(parsed.frontmatter.summary_generated_at),
    summarySource: scalar(parsed.frontmatter.summary_source) === "assistant" ? "assistant" : "import",
    summaryModel: scalar(parsed.frontmatter.summary_model),
    nextSteps: arrayOfStrings(parsed.frontmatter.next_steps),
    blockers: arrayOfStrings(parsed.frontmatter.blockers),
    touchedFiles: arrayOfStrings(parsed.frontmatter.touched_files),
    workstreamIds: arrayOfStrings(parsed.frontmatter.workstream_ids),
    relatedDocs: arrayOfStrings(parsed.frontmatter.related_docs),
    relatedTasks: arrayOfStrings(parsed.frontmatter.related_tasks),
    contextBundleId: scalar(parsed.frontmatter.context_bundle_id),
    checkpoints: [],
    filePath: args.targetPath,
    body: importedBody(parsed.body, raw, args.candidate.title),
    importSourcePath: args.candidate.sourcePath,
    importSourceHash: args.candidate.sourceHash,
    importedAt,
    importProfile: args.plan.profileName
  };
  await writeSession(session);
}

async function targetForCommit(
  targetPath: string,
  sourceHash: string,
  strategy: ImportConflictStrategy
): Promise<string | undefined> {
  if (!(await pathExists(targetPath))) return targetPath;
  if (strategy === "skip") return undefined;
  if (strategy === "overwrite") return targetPath;

  const extension = path.extname(targetPath) || ".md";
  const stem = targetPath.slice(0, -extension.length);
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? sourceHash.slice(0, 8) : `${sourceHash.slice(0, 8)}-${index + 1}`;
    const candidate = `${stem}__${suffix}${extension}`;
    if (!(await pathExists(candidate))) return candidate;
  }

  throw new Error(`Could not allocate duplicate import target for ${targetPath}`);
}

function importedTargetPath(
  project: Project,
  profile: ImportProfile,
  kind: Exclude<ImportItemKind, "skip">,
  relativePath: string
): string {
  const rootFolder = kind === "session" ? "sessions" : "docs";
  return path.join(
    project.memoryRoot,
    rootFolder,
    "imported",
    filenameSafe(profile.name),
    safeRelativeMarkdownPath(relativePath)
  );
}

function safeRelativeMarkdownPath(relativePath: string): string {
  const parsed = path.posix.parse(normalizeRelative(relativePath));
  const directories = parsed.dir.split("/").filter(Boolean).map((part) => filenameSafe(part));
  return [...directories, `${filenameSafe(parsed.name)}.md`].join("/");
}

function resolveInputPath(input: string): string {
  return path.resolve(input);
}

function requiredSourceRoot(sourceRoot?: string): string {
  if (!sourceRoot) throw new Error("Missing import sourceRoot.");
  return sourceRoot;
}

function normalizeRelative(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\/+/, "");
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function inferTitle(frontmatter: Record<string, unknown>, body: string, relativePath: string): string {
  const explicit = scalar(frontmatter.title) || scalar(frontmatter.task_title);
  if (explicit) return explicit;
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  if (heading) return heading;
  return path.basename(relativePath, path.extname(relativePath)).replace(/[-_]+/g, " ");
}

function inferSummary(body: string): string | undefined {
  const paragraph = body
    .replace(/^#\s+.+$/m, "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part && !part.startsWith("#") && !part.startsWith("|"));
  return paragraph ? truncate(paragraph.replace(/\s+/g, " "), 240) : undefined;
}

function importedBody(parsedBody: string, raw: string, title: string): string {
  const body = parsedBody.trim() ? parsedBody : raw;
  return body.trim() ? body : `# ${title}\n`;
}

function inferDateFromPath(relativePath: string): string | undefined {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(relativePath);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`;

  const short = /(?:^|[^\d])(\d{2})-(\d{2})-(\d{2})(?:[^\d]|$)/.exec(relativePath);
  if (!short) return undefined;
  const [, month, day, year] = short;
  return `20${year}-${month}-${day}T00:00:00.000Z`;
}

function topicsFromRelativePath(relativePath: string): string[] {
  const parsed = path.posix.parse(normalizeRelative(relativePath));
  return unique(
    parsed.dir
      .split("/")
      .filter(Boolean)
      .map((part) => filenameSafe(part))
      .filter(Boolean)
  );
}

function formatFromPath(relativePath: string): MemoryDocument["format"] {
  return relativePath.toLowerCase().endsWith(".txt") ? "text" : "markdown";
}

function stripBom(input: string): string {
  return input.replace(/^\uFEFF/, "");
}

function scalar(input: unknown): string | undefined {
  if (input === undefined || input === null || Array.isArray(input)) return undefined;
  const value = String(input).trim();
  return value ? value : undefined;
}

function arrayOfStrings(input: unknown): string[] {
  return Array.isArray(input) ? input.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function asDocumentType(input: unknown): DocumentType | undefined {
  return DOCUMENT_TYPES.includes(input as DocumentType) ? (input as DocumentType) : undefined;
}

function asDocumentStatus(input: unknown): DocumentStatus | undefined {
  return DOCUMENT_STATUSES.includes(input as DocumentStatus) ? (input as DocumentStatus) : undefined;
}

function asVisibility(input: unknown): Visibility | undefined {
  return VISIBILITIES.includes(input as Visibility) ? (input as Visibility) : undefined;
}

function asDocumentFormat(input: unknown): MemoryDocument["format"] | undefined {
  return DOCUMENT_FORMATS.includes(input as NonNullable<MemoryDocument["format"]>)
    ? (input as MemoryDocument["format"])
    : undefined;
}

function asConfidence(input: unknown): MemoryDocument["confidence"] | undefined {
  return input === "low" || input === "medium" || input === "high" ? input : undefined;
}
