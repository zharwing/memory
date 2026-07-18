import path from "node:path";
import {
  createId,
  createSessionFilename,
  defaultSessionTitle,
  nowIso,
  type Project,
  type Session,
  type SessionCheckpoint,
  type SessionId,
  type WorkstreamId
} from "@zharwing/memory-core";
import { listFiles, pathExists, readText, writeText } from "./fs.js";
import { formatMarkdown, parseMarkdown } from "./markdown.js";
import { sessionBodyTemplate } from "./templates.js";

export async function startSession(args: {
  project: Project;
  repoPath: string;
  workingDirectory: string;
  branch?: string;
  agent?: string;
  client?: string;
  taskTitle?: string;
  goal?: string;
  workstreamIds?: WorkstreamId[];
}): Promise<Session> {
  const now = nowIso();
  const started = new Date(now);
  const taskTitle = args.taskTitle?.trim() || defaultSessionTitle(started);
  const id = createId("session");
  const fileName = createSessionFilename({
    date: started,
    taskTitle: args.taskTitle
  });
  const year = String(started.getFullYear());
  const month = String(started.getMonth() + 1).padStart(2, "0");
  const filePath = await uniqueSessionFilePath(path.join(args.project.memoryRoot, "sessions", year, month, fileName));

  const body = sessionBodyTemplate({ taskTitle, goal: args.goal, created: now });
  const session: Session = {
    id,
    projectId: args.project.id,
    repoPath: args.repoPath,
    workingDirectory: args.workingDirectory,
    branch: args.branch,
    agent: args.agent,
    client: args.client,
    status: "active",
    started: now,
    updated: now,
    taskTitle,
    goal: args.goal,
    topics: [],
    nextSteps: [],
    blockers: [],
    touchedFiles: [],
    workstreamIds: args.workstreamIds || [],
    relatedDocs: [],
    relatedTasks: [],
    checkpoints: [],
    filePath,
    body
  };

  await writeSession(session);
  return session;
}

async function uniqueSessionFilePath(filePath: string): Promise<string> {
  if (!(await pathExists(filePath))) return filePath;

  const extension = path.extname(filePath);
  const base = filePath.slice(0, -extension.length);
  let index = 2;
  while (await pathExists(`${base}-${index}${extension}`)) {
    index += 1;
  }
  return `${base}-${index}${extension}`;
}

export async function writeSession(session: Session, body?: string): Promise<void> {
  if (!session.filePath) {
    throw new Error(`Cannot write session ${session.id} without filePath`);
  }
  const markdown = formatMarkdown(
    {
      id: session.id,
      project_id: session.projectId,
      repo_path: session.repoPath,
      working_directory: session.workingDirectory,
      branch: session.branch,
      agent: session.agent,
      client: session.client,
      status: session.status,
      started: session.started,
      updated: session.updated,
      closed: session.closed,
      task_title: session.taskTitle,
      goal: session.goal,
      summary: session.summary,
      topics: session.topics,
      summary_generated_at: session.summaryGeneratedAt,
      summary_source: session.summarySource,
      summary_model: session.summaryModel,
      next_steps: session.nextSteps,
      blockers: session.blockers,
      touched_files: session.touchedFiles,
      workstream_ids: session.workstreamIds,
      related_docs: session.relatedDocs,
      related_tasks: session.relatedTasks,
      context_bundle_id: session.contextBundleId,
      import_source_path: session.importSourcePath,
      import_source_hash: session.importSourceHash,
      imported_at: session.importedAt,
      import_profile: session.importProfile
    },
    body ?? session.body ?? sessionToBody(session)
  );
  await writeText(session.filePath, markdown);
}

export async function listProjectSessions(project: Project): Promise<Session[]> {
  const root = path.join(project.memoryRoot, "sessions");
  const files = await listFiles(root, (file) => file.endsWith(".md"));
  const sessions = await Promise.all(files.map((file) => readSession(file)));
  return sessions.sort((a, b) => b.updated.localeCompare(a.updated));
}

export async function getSession(project: Project, sessionId: SessionId): Promise<Session | undefined> {
  const sessions = await listProjectSessions(project);
  return sessions.find((session) => session.id === sessionId);
}

export async function getActiveSession(project: Project): Promise<Session | undefined> {
  const sessions = await listProjectSessions(project);
  return sessions.find((session) => session.status === "active");
}

export async function getLatestSession(project: Project): Promise<Session | undefined> {
  const sessions = await listProjectSessions(project);
  return sessions[0];
}

export async function saveCheckpoint(args: {
  project: Project;
  sessionId: SessionId;
  summary: string;
  nextSteps?: string[];
  blockers?: string[];
  touchedFiles?: string[];
  proposedUpdateIds?: string[];
}): Promise<Session> {
  const session = await getSession(args.project, args.sessionId);
  if (!session) throw new Error(`Session not found: ${args.sessionId}`);

  const checkpoint: SessionCheckpoint = {
    id: createId("checkpoint"),
    created: nowIso(),
    summary: args.summary,
    nextSteps: args.nextSteps || [],
    blockers: args.blockers || [],
    touchedFiles: args.touchedFiles || [],
    proposedUpdateIds: args.proposedUpdateIds || []
  };

  const next: Session = {
    ...session,
    updated: checkpoint.created,
    summary: args.summary,
    nextSteps: mergeUnique(session.nextSteps, checkpoint.nextSteps),
    blockers: mergeUnique(session.blockers, checkpoint.blockers),
    touchedFiles: mergeUnique(session.touchedFiles, checkpoint.touchedFiles),
    checkpoints: [...session.checkpoints, checkpoint],
    body: appendCheckpointToBody(session.body ?? sessionToBody(session), checkpoint)
  };

  await writeSession(next);
  return next;
}

export async function closeSession(args: {
  project: Project;
  sessionId: SessionId;
  summary?: string;
  nextSteps?: string[];
  topics?: string[];
  summaryGeneratedAt?: string;
  summarySource?: Session["summarySource"];
  summaryModel?: string;
}): Promise<Session> {
  const session = await getSession(args.project, args.sessionId);
  if (!session) throw new Error(`Session not found: ${args.sessionId}`);
  const now = nowIso();
  const next: Session = {
    ...session,
    status: "closed",
    summary: args.summary || session.summary,
    topics: args.topics ? mergeUnique(session.topics, args.topics) : session.topics,
    summaryGeneratedAt: args.summaryGeneratedAt || session.summaryGeneratedAt,
    summarySource: args.summarySource || (args.summary ? "manual" : session.summarySource),
    summaryModel: args.summaryModel || session.summaryModel,
    nextSteps: mergeUnique(session.nextSteps, args.nextSteps || []),
    updated: now,
    closed: now,
    body: appendCloseToBody(session.body ?? sessionToBody(session), {
      closed: now,
      summary: args.summary,
      nextSteps: args.nextSteps || []
    })
  };
  await writeSession(next);
  return next;
}

export async function updateSessionSummary(args: {
  project: Project;
  sessionId: SessionId;
  summary: string;
  topics?: string[];
  nextSteps?: string[];
  blockers?: string[];
  touchedFiles?: string[];
  summaryGeneratedAt?: string;
  summarySource?: Session["summarySource"];
  summaryModel?: string;
}): Promise<Session> {
  const session = await getSession(args.project, args.sessionId);
  if (!session) throw new Error(`Session not found: ${args.sessionId}`);
  const updated = args.summaryGeneratedAt || nowIso();
  const next: Session = {
    ...session,
    summary: args.summary,
    topics: mergeUnique(session.topics, args.topics || []),
    nextSteps: mergeUnique(session.nextSteps, args.nextSteps || []),
    blockers: mergeUnique(session.blockers, args.blockers || []),
    touchedFiles: mergeUnique(session.touchedFiles, args.touchedFiles || []),
    summaryGeneratedAt: updated,
    summarySource: args.summarySource || "assistant",
    summaryModel: args.summaryModel || session.summaryModel,
    updated,
    body: replaceSessionSummarySection(session.body ?? sessionToBody(session), args.summary)
  };
  await writeSession(next);
  return next;
}

export async function readSession(filePath: string): Promise<Session> {
  const raw = await readText(filePath);
  const parsed = parseMarkdown(raw);
  const fm = parsed.frontmatter;

  const session: Session = {
    id: String(fm.id),
    projectId: String(fm.project_id),
    repoPath: String(fm.repo_path || ""),
    workingDirectory: String(fm.working_directory || ""),
    branch: stringOrUndefined(fm.branch),
    agent: stringOrUndefined(fm.agent),
    client: stringOrUndefined(fm.client),
    status: (fm.status as Session["status"]) || "closed",
    started: String(fm.started || ""),
    updated: String(fm.updated || fm.started || ""),
    closed: stringOrUndefined(fm.closed),
    taskTitle: String(fm.task_title || path.basename(filePath, ".md")),
    goal: stringOrUndefined(fm.goal),
    summary: stringOrUndefined(fm.summary),
    topics: arrayOfStrings(fm.topics),
    summaryGeneratedAt: stringOrUndefined(fm.summary_generated_at),
    summarySource: summarySourceOrUndefined(fm.summary_source),
    summaryModel: stringOrUndefined(fm.summary_model),
    nextSteps: arrayOfStrings(fm.next_steps),
    blockers: arrayOfStrings(fm.blockers),
    touchedFiles: arrayOfStrings(fm.touched_files),
    workstreamIds: arrayOfStrings(fm.workstream_ids),
    relatedDocs: arrayOfStrings(fm.related_docs),
    relatedTasks: arrayOfStrings(fm.related_tasks),
    contextBundleId: stringOrUndefined(fm.context_bundle_id),
    checkpoints: extractCheckpoints(parsed.body),
    filePath,
    body: parsed.body,
    importSourcePath: stringOrUndefined(fm.import_source_path),
    importSourceHash: stringOrUndefined(fm.import_source_hash),
    importedAt: stringOrUndefined(fm.imported_at),
    importProfile: stringOrUndefined(fm.import_profile)
  };

  return session;
}

function sessionToBody(session: Session): string {
  const checkpoints = session.checkpoints
    .map(
      (checkpoint) => `### ${checkpoint.created}

${checkpoint.summary}

Next steps:
${checkpoint.nextSteps.map((step) => `- ${step}`).join("\n") || "- None recorded"}

Blockers:
${checkpoint.blockers.map((blocker) => `- ${blocker}`).join("\n") || "- None recorded"}`
    )
    .join("\n\n");

  return `# ${session.taskTitle}

## Goal

${session.goal || "No explicit goal recorded yet."}

## Summary

${session.summary || "No summary recorded yet."}

## Progress Log

${checkpoints || "- No checkpoints recorded yet."}

## Files Touched

${session.touchedFiles.map((file) => `- ${file}`).join("\n") || "None recorded yet."}

## Blockers

${session.blockers.map((blocker) => `- ${blocker}`).join("\n") || "None recorded yet."}

## Next Steps

${session.nextSteps.map((step) => `- ${step}`).join("\n") || "None recorded yet."}
`;
}

function appendCheckpointToBody(body: string, checkpoint: SessionCheckpoint): string {
  const section = `## Checkpoint - ${checkpoint.created}

${checkpoint.summary}

Next steps:
${checkpoint.nextSteps.map((step) => `- ${step}`).join("\n") || "- None recorded"}

Blockers:
${checkpoint.blockers.map((blocker) => `- ${blocker}`).join("\n") || "- None recorded"}

Touched files:
${checkpoint.touchedFiles.map((file) => `- ${file}`).join("\n") || "- None recorded"}
`;

  return `${body.trim()}\n\n${section.trim()}\n`;
}

function appendCloseToBody(
  body: string,
  close: { closed: string; summary?: string; nextSteps: string[] }
): string {
  const section = `## Session Closed - ${close.closed}

${close.summary || "No final summary recorded."}

Next steps:
${close.nextSteps.map((step) => `- ${step}`).join("\n") || "- None recorded"}
`;

  return `${body.trim()}\n\n${section.trim()}\n`;
}

function replaceSessionSummarySection(body: string, summary: string): string {
  const nextSummary = `## Summary\n\n${summary.trim() || "No summary recorded yet."}`;
  const summarySection = /## Summary\n\n[\s\S]*?(?=\n## |\n?$)/;
  if (summarySection.test(body)) return body.replace(summarySection, nextSummary);
  return `${body.trim()}\n\n${nextSummary}\n`;
}

function extractCheckpoints(body: string): SessionCheckpoint[] {
  const matches = [...body.matchAll(/^#{2,3}\s+(?:Checkpoint\s+-\s+)?(\d{4}-\d{2}-\d{2}T[^\n]+)$/gm)];

  return matches.map((match, index) => {
    const created = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    const section = body.slice(start, end).trim();
    const summary = section.split(/\n(?:Next steps|Blockers|Touched files):/i)[0]?.trim() || "No summary recorded.";

    return {
      id: `checkpoint-${created.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      created,
      summary,
      nextSteps: extractList(section, "Next steps"),
      blockers: extractList(section, "Blockers"),
      touchedFiles: extractList(section, "Touched files"),
      proposedUpdateIds: []
    };
  });
}

function extractList(section: string, label: string): string[] {
  const lines = section.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim().toLowerCase() === `${label.toLowerCase()}:`);
  if (startIndex === -1) return [];

  const values: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    const trimmed = line.trim();
    if (/^(Next steps|Blockers|Touched files):$/i.test(trimmed) || /^#{1,6}\s/.test(trimmed)) break;
    if (!trimmed.startsWith("-")) continue;
    const value = trimmed.replace(/^-\s*/, "").trim();
    if (value && value.toLowerCase() !== "none recorded") values.push(value);
  }
  return values;
}

function arrayOfStrings(input: unknown): string[] {
  return Array.isArray(input) ? input.map(String).filter(Boolean) : [];
}

function stringOrUndefined(input: unknown): string | undefined {
  const value = String(input || "");
  return value ? value : undefined;
}

function summarySourceOrUndefined(input: unknown): Session["summarySource"] | undefined {
  return input === "manual" || input === "assistant" || input === "deterministic" || input === "import"
    ? input
    : undefined;
}

function mergeUnique(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right].filter(Boolean))];
}
