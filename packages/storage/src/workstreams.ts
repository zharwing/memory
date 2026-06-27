import path from "node:path";
import {
  createId,
  filenameSafe,
  nowIso,
  slugify,
  type MemoryDocument,
  type Project,
  type RepoLink,
  type Session,
  type Workstream,
  type WorkstreamDetail,
  type WorkstreamId,
  type WorkstreamStatus
} from "@aimem/core";
import { listFiles, readText, writeText } from "./fs.js";
import { formatMarkdown, parseMarkdown } from "./markdown.js";
import { listProjectDocuments } from "./documents.js";
import { listProjectSessions } from "./sessions.js";

export async function createWorkstream(args: {
  project: Project;
  name: string;
  summary?: string;
  goal?: string;
  topics?: string[];
  repoRoles?: RepoLink["role"][];
  relatedTasks?: string[];
  relatedFiles?: string[];
  body?: string;
}): Promise<Workstream> {
  const now = nowIso();
  const slug = slugify(args.name);
  const filePath = path.join(args.project.memoryRoot, "workstreams", `${filenameSafe(slug)}.md`);
  const workstream: Workstream = {
    id: createId("workstream"),
    projectId: args.project.id,
    name: args.name,
    slug,
    status: "active",
    summary: args.summary,
    goal: args.goal,
    topics: normalizeTags([slug, ...(args.topics || [])]),
    repoRoles: normalizeRepoRoles(args.repoRoles || []),
    relatedTasks: args.relatedTasks || [],
    relatedFiles: args.relatedFiles || [],
    pinnedDocIds: [],
    created: now,
    updated: now,
    filePath,
    body: args.body || workstreamBodyTemplate(args)
  };
  await writeWorkstream(workstream);
  return workstream;
}

export async function writeWorkstream(workstream: Workstream): Promise<void> {
  if (!workstream.filePath) {
    throw new Error(`Cannot write workstream ${workstream.id} without filePath`);
  }
  await writeText(
    workstream.filePath,
    formatMarkdown(
      {
        id: workstream.id,
        project_id: workstream.projectId,
        name: workstream.name,
        slug: workstream.slug,
        status: workstream.status,
        summary: workstream.summary,
        goal: workstream.goal,
        topics: workstream.topics,
        repo_roles: workstream.repoRoles,
        related_tasks: workstream.relatedTasks,
        related_files: workstream.relatedFiles,
        pinned_doc_ids: workstream.pinnedDocIds,
        created: workstream.created,
        updated: workstream.updated,
        closed: workstream.closed
      },
      workstream.body
    )
  );
}

export async function listProjectWorkstreams(project: Project): Promise<Workstream[]> {
  const root = path.join(project.memoryRoot, "workstreams");
  const files = await listFiles(root, (file) => file.endsWith(".md"));
  const workstreams = await Promise.all(files.map((file) => readWorkstream(project, file)));
  return workstreams.sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.updated.localeCompare(a.updated));
}

export async function getWorkstream(project: Project, workstreamId: WorkstreamId): Promise<Workstream | undefined> {
  const workstreams = await listProjectWorkstreams(project);
  return workstreams.find((workstream) => workstream.id === workstreamId || workstream.slug === workstreamId);
}

export async function getWorkstreamDetail(project: Project, workstreamId: WorkstreamId): Promise<WorkstreamDetail> {
  const workstream = await getWorkstream(project, workstreamId);
  if (!workstream) throw new Error(`Workstream not found: ${workstreamId}`);
  const [sessions, documents] = await Promise.all([
    listProjectSessions(project),
    listProjectDocuments(project)
  ]);
  return {
    workstream,
    sessions: sessions.filter((session) => sessionMatchesWorkstream(session, workstream)),
    documents: documents.filter((doc) => documentMatchesWorkstream(doc, workstream))
  };
}

export async function updateWorkstreamStatus(args: {
  project: Project;
  workstreamId: WorkstreamId;
  status: WorkstreamStatus;
}): Promise<Workstream> {
  const workstream = await getWorkstream(args.project, args.workstreamId);
  if (!workstream) throw new Error(`Workstream not found: ${args.workstreamId}`);
  const now = nowIso();
  const next: Workstream = {
    ...workstream,
    status: args.status,
    updated: now,
    closed: args.status === "done" || args.status === "archived" ? workstream.closed || now : undefined
  };
  await writeWorkstream(next);
  return next;
}

export async function readWorkstream(project: Project, filePath: string): Promise<Workstream> {
  const raw = await readText(filePath);
  const parsed = parseMarkdown(raw);
  const fm = parsed.frontmatter;
  const name = String(fm.name || fm.title || inferTitle(parsed.body) || path.basename(filePath, ".md"));
  return {
    id: String(fm.id || createId("workstream")),
    projectId: String(fm.project_id || fm.project || project.id),
    name,
    slug: String(fm.slug || slugify(name)),
    status: asWorkstreamStatus(fm.status),
    summary: stringOrUndefined(fm.summary),
    goal: stringOrUndefined(fm.goal),
    topics: normalizeTags(arrayOfStrings(fm.topics)),
    repoRoles: normalizeRepoRoles(arrayOfStrings(fm.repo_roles)),
    relatedTasks: arrayOfStrings(fm.related_tasks),
    relatedFiles: arrayOfStrings(fm.related_files),
    pinnedDocIds: arrayOfStrings(fm.pinned_doc_ids),
    created: String(fm.created || nowIso()),
    updated: String(fm.updated || fm.created || nowIso()),
    closed: stringOrUndefined(fm.closed),
    filePath,
    body: parsed.body
  };
}

export function sessionMatchesWorkstream(session: Session, workstream: Workstream): boolean {
  const terms = workstreamTerms(workstream);
  return includesAny(session.workstreamIds, [workstream.id, workstream.slug]) ||
    includesAny(session.relatedTasks, terms) ||
    includesAny([session.taskTitle, session.goal, session.summary, session.body].filter(Boolean).map(String), terms);
}

export function documentMatchesWorkstream(doc: MemoryDocument, workstream: Workstream): boolean {
  const terms = workstreamTerms(workstream);
  return includesAny(doc.workstreamIds, [workstream.id, workstream.slug]) ||
    includesAny(doc.relatedTasks, terms) ||
    includesAny(doc.topics, terms) ||
    includesAny([doc.title, doc.body].filter(Boolean).map(String), terms) ||
    workstream.pinnedDocIds.includes(doc.id);
}

function workstreamBodyTemplate(args: { name: string; summary?: string; goal?: string }) {
  return `# ${args.name}

## Goal

${args.goal || "No explicit goal recorded yet."}

## Summary

${args.summary || "Use this workstream to group related sessions, docs, decisions, gotchas, and imported memory over multiple days."}

## Current State

- Active.

## Next Steps

- Add sessions and docs related to this workstream.
`;
}

function workstreamTerms(workstream: Workstream): string[] {
  return normalizeTags([workstream.id, workstream.slug, workstream.name, ...(workstream.topics || []), ...(workstream.relatedTasks || [])]);
}

function includesAny(values: string[], terms: string[]): boolean {
  const normalizedValues = values.map((value) => value.toLowerCase());
  return terms.some((term) => normalizedValues.some((value) => value === term || value.includes(term)));
}

function normalizeTags(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function normalizeRepoRoles(values: string[]): RepoLink["role"][] {
  return normalizeTags(values);
}

function asWorkstreamStatus(input: unknown): WorkstreamStatus {
  return input === "paused" || input === "done" || input === "archived" ? input : "active";
}

function statusRank(status: WorkstreamStatus): number {
  return status === "active" ? 0 : status === "paused" ? 1 : status === "done" ? 2 : 3;
}

function inferTitle(body: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(body);
  return match?.[1];
}

function arrayOfStrings(input: unknown): string[] {
  return Array.isArray(input) ? input.map(String).filter(Boolean) : [];
}

function stringOrUndefined(input: unknown): string | undefined {
  const value = String(input || "");
  return value ? value : undefined;
}
