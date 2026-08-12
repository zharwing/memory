import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createId,
  createSessionFilename,
  defaultSessionTitle,
  nowIso,
  truncate,
  truncateOptional,
  unique,
  type Project,
  type Session,
  type SessionCheckpoint,
  type SessionSummary,
  type SessionId,
  type WorkstreamId
} from "@zharwing/memory-core";
import {
  atomicWriteText,
  listFiles,
  pathExists,
  withStorageMutationLease
} from "./fs.js";
import { formatMarkdown, parseMarkdown } from "./markdown.js";
import { sessionBodyTemplate } from "./templates.js";
import {
  DomainEffectConflictError,
  DomainEffectOutcomeUnknownError,
  appendDomainEffectMarker,
  assertDurableDomainEffect,
  assertMatchingDomainEffectMarker,
  attachDomainEffectMarkers,
  createDomainEffectMarker,
  decodeDomainEffectMarkers,
  domainValueRevision,
  encodeDomainEffectMarkers,
  getDomainEffectMarkers,
  type DurableDomainEffect
} from "./domain-effects.js";

const MAX_SESSION_TITLE_CHARS = 240;
const MAX_SESSION_GOAL_CHARS = 800;
const MAX_SESSION_SUMMARY_CHARS = 1600;
const MAX_STATE_ITEM_CHARS = 300;
const MAX_PATH_CHARS = 400;
const MAX_ID_CHARS = 160;
const MAX_TOPIC_CHARS = 80;
const SESSION_SUMMARY_CACHE = new Map<string, {
  mtimeMs: number;
  size: number;
  summary: SessionSummary;
}>();

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
  effect?: DurableDomainEffect;
}): Promise<Session> {
  const effect = args.effect;
  if (effect) {
    assertDurableDomainEffect(effect, args.project, "memory.start_session");
    return withProjectSessionEffectLease(args.project, async () => {
      const reconciled = await reconcileSessionEffect(args.project, effect);
      if (reconciled) return reconciled;
      if (effect.mode === "reconcile") throw new DomainEffectOutcomeUnknownError();
      return createAndWriteSession(args, effect);
    });
  }
  return withProjectSessionEffectLease(args.project, () => createAndWriteSession(args));
}

async function createAndWriteSession(args: {
  project: Project;
  repoPath: string;
  workingDirectory: string;
  branch?: string;
  agent?: string;
  client?: string;
  taskTitle?: string;
  goal?: string;
  workstreamIds?: WorkstreamId[];
}, effect?: DurableDomainEffect): Promise<Session> {
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
  let session: Session = {
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
    includeInGraph: false,
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
    body,
    stateSemanticsVersion: 2
  };

  if (effect) {
    session = appendDomainEffectMarker(session, createDomainEffectMarker({
      effect,
      resultKind: "session",
      resultId: session.id,
      resultRevision: sessionDomainRevision(session),
      committedAt: now
    }), effect);
  }
  await writeSession(session, undefined, args.project.memoryRoot);
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

export async function writeSession(session: Session, body?: string, ownerRoot?: string): Promise<void> {
  if (!session.filePath) {
    throw new Error(`Cannot write session ${session.id} without filePath`);
  }
  const markdown = storedSessionMarkdown(session, body, true);
  await atomicWriteText(session.filePath, markdown, {
    root: ownerRoot ?? path.dirname(session.filePath),
    maximumBytes: 32 * 1024 * 1024
  });
  SESSION_SUMMARY_CACHE.delete(session.filePath);
}

export async function listProjectSessions(project: Project): Promise<Session[]> {
  const files = await listProjectSessionFiles(project);
  const sessions = await Promise.all(files.map((file) => readSession(file, project.memoryRoot)));
  return sessions.sort((a, b) => b.updated.localeCompare(a.updated));
}

export async function listProjectSessionSummaries(project: Project): Promise<SessionSummary[]> {
  const files = await listProjectSessionFiles(project);
  const summaries = await Promise.all(files.map((file) => readSessionSummary(file, project.memoryRoot)));
  return summaries.sort((a, b) => b.updated.localeCompare(a.updated));
}

export async function getSession(project: Project, sessionId: SessionId): Promise<Session | undefined> {
  const filePath = await findSessionFile(project, sessionId);
  return filePath ? readSession(filePath, project.memoryRoot) : undefined;
}

export async function getActiveSession(project: Project): Promise<Session | undefined> {
  const summaries = await listProjectSessionSummaries(project);
  const active = summaries.find((session) => session.status === "active");
  return active ? getSession(project, active.id) : undefined;
}

export async function getLatestSession(project: Project): Promise<Session | undefined> {
  const latest = (await listProjectSessionSummaries(project))[0];
  return latest ? getSession(project, latest.id) : undefined;
}

export async function saveCheckpoint(args: {
  project: Project;
  sessionId: SessionId;
  summary: string;
  nextSteps?: string[];
  blockers?: string[];
  touchedFiles?: string[];
  proposedUpdateIds?: string[];
  workstreamIds?: WorkstreamId[];
  effect?: DurableDomainEffect;
  expectedRevision?: string;
}): Promise<Session> {
  if (args.effect) {
    assertDurableDomainEffect(args.effect, args.project, "memory.save_checkpoint");
    return mutateSessionEffect(
      args.project,
      args.sessionId,
      args.effect,
      args.expectedRevision,
      (session) => checkpointResult(session, args)
    );
  }
  return withProjectSessionEffectLease(args.project, async () => {
    const session = await getSession(args.project, args.sessionId);
    if (!session) throw new Error(`Session not found: ${args.sessionId}`);
    const next = checkpointResult(session, args);
    await writeSession(next, undefined, args.project.memoryRoot);
    return next;
  });
}

function checkpointResult(
  session: Session,
  args: {
    summary: string;
    nextSteps?: string[];
    blockers?: string[];
    touchedFiles?: string[];
    proposedUpdateIds?: string[];
    workstreamIds?: WorkstreamId[];
  }
): Session {
  const checkpoint: SessionCheckpoint = {
    id: createId("checkpoint"),
    created: nowIso(),
    summary: args.summary,
    nextSteps: args.nextSteps || [],
    blockers: args.blockers || [],
    touchedFiles: args.touchedFiles || [],
    proposedUpdateIds: args.proposedUpdateIds || [],
    stateFields: [
      ...(args.nextSteps !== undefined ? ["nextSteps" as const] : []),
      ...(args.blockers !== undefined ? ["blockers" as const] : [])
    ]
  };

  const next: Session = {
    ...session,
    updated: checkpoint.created,
    summary: args.summary,
    nextSteps: args.nextSteps !== undefined ? mergeUnique([], checkpoint.nextSteps) : session.nextSteps,
    blockers: args.blockers !== undefined ? mergeUnique([], checkpoint.blockers) : session.blockers,
    touchedFiles: mergeUnique(session.touchedFiles, checkpoint.touchedFiles),
    workstreamIds: mergeUnique(session.workstreamIds, args.workstreamIds || []),
    checkpoints: [...session.checkpoints, checkpoint],
    body: appendCheckpointToBody(session.body ?? sessionToBody(session), checkpoint),
    stateSemanticsVersion: 2
  };
  return next;
}

export async function closeSession(args: {
  project: Project;
  sessionId: SessionId;
  summary?: string;
  nextSteps?: string[];
  blockers?: string[];
  workstreamIds?: WorkstreamId[];
  topics?: string[];
  summaryGeneratedAt?: string;
  summarySource?: Session["summarySource"];
  summaryModel?: string;
  /** Recorded when the close was not an explicit user or agent request. */
  closedReason?: string;
  /**
   * Keeps `updated` at the last real activity. Housekeeping closes use this so
   * a stale session does not jump to the top of the recency-sorted list.
   */
  preserveUpdated?: boolean;
  effect?: DurableDomainEffect;
  expectedRevision?: string;
}): Promise<Session> {
  if (args.effect) {
    assertDurableDomainEffect(args.effect, args.project, "memory.close_session");
    return mutateSessionEffect(
      args.project,
      args.sessionId,
      args.effect,
      args.expectedRevision,
      (session) => closeResult(session, args)
    );
  }
  return withProjectSessionEffectLease(args.project, async () => {
    const session = await getSession(args.project, args.sessionId);
    if (!session) throw new Error(`Session not found: ${args.sessionId}`);
    const next = closeResult(session, args);
    await writeSession(next, undefined, args.project.memoryRoot);
    return next;
  });
}

function closeResult(
  session: Session,
  args: {
    summary?: string;
    nextSteps?: string[];
    blockers?: string[];
    workstreamIds?: WorkstreamId[];
    topics?: string[];
    summaryGeneratedAt?: string;
    summarySource?: Session["summarySource"];
    summaryModel?: string;
    closedReason?: string;
    preserveUpdated?: boolean;
  }
): Session {
  const now = nowIso();
  const next: Session = {
    ...session,
    status: "closed",
    summary: args.summary || session.summary,
    topics: args.topics ? mergeUnique(session.topics, args.topics) : session.topics,
    summaryGeneratedAt: args.summaryGeneratedAt || session.summaryGeneratedAt,
    summarySource: args.summarySource || (args.summary ? "manual" : session.summarySource),
    summaryModel: args.summaryModel || session.summaryModel,
    nextSteps: args.nextSteps !== undefined ? mergeUnique([], args.nextSteps) : session.nextSteps,
    blockers: args.blockers !== undefined ? mergeUnique([], args.blockers) : session.blockers,
    workstreamIds: mergeUnique(session.workstreamIds, args.workstreamIds || []),
    updated: args.preserveUpdated ? session.updated : now,
    closed: now,
    closedReason: args.closedReason || session.closedReason,
    body: appendCloseToBody(session.body ?? sessionToBody(session), {
      closed: now,
      summary: args.summary,
      nextSteps: args.nextSteps,
      blockers: args.blockers,
      reason: args.closedReason
    }),
    stateSemanticsVersion: 2
  };
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
  return withProjectSessionEffectLease(args.project, async () => {
    const session = await getSession(args.project, args.sessionId);
    if (!session) throw new Error(`Session not found: ${args.sessionId}`);
    const updated = args.summaryGeneratedAt || nowIso();
    const next: Session = {
      ...session,
      summary: args.summary,
      topics: mergeUnique(session.topics, args.topics || []),
      nextSteps: args.nextSteps !== undefined ? mergeUnique([], args.nextSteps) : session.nextSteps,
      blockers: args.blockers !== undefined ? mergeUnique([], args.blockers) : session.blockers,
      touchedFiles: mergeUnique(session.touchedFiles, args.touchedFiles || []),
      summaryGeneratedAt: updated,
      summarySource: args.summarySource || "assistant",
      summaryModel: args.summaryModel || session.summaryModel,
      updated,
      body: replaceSessionSummarySection(session.body ?? sessionToBody(session), args.summary),
      stateSemanticsVersion: 2
    };
    await writeSession(next, undefined, args.project.memoryRoot);
    return next;
  });
}

export async function updateSessionGraphVisibility(args: {
  project: Project;
  sessionId: SessionId;
  includeInGraph: boolean;
}): Promise<Session> {
  return withProjectSessionEffectLease(args.project, async () => {
    const session = await getSession(args.project, args.sessionId);
    if (!session) throw new Error(`Session not found: ${args.sessionId}`);

    const next: Session = {
      ...session,
      includeInGraph: args.includeInGraph
    };
    await writeSession(next, undefined, args.project.memoryRoot);
    return next;
  });
}

export async function readSession(filePath: string, ownerRoot?: string): Promise<Session> {
  const raw = await readSafeSessionText(filePath, ownerRoot);
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
    closedReason: stringOrUndefined(fm.closed_reason),
    taskTitle: String(fm.task_title || path.basename(filePath, ".md")),
    includeInGraph: fm.include_in_graph === true,
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
    importProfile: stringOrUndefined(fm.import_profile),
    stateSemanticsVersion: fm.state_semantics_version === 2 ? 2 : undefined
  };
  return attachDomainEffectMarkers(session, decodeDomainEffectMarkers(fm.domain_effects));
}

export async function readSessionSummary(filePath: string, ownerRoot?: string): Promise<SessionSummary> {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 32 * 1024 * 1024) {
    throw new Error("Session file is unsafe or oversized.");
  }
  await assertSafeSessionPath(filePath, ownerRoot);
  const cached = SESSION_SUMMARY_CACHE.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.summary;
  }

  const raw = await readFrontmatterPrefix(filePath, ownerRoot);
  const fm = parseMarkdown(raw).frontmatter;
  const touchedFiles = arrayOfStrings(fm.touched_files);
  const checkpointCount = numericOrUndefined(fm.checkpoint_count)
    ?? await countCheckpointSections(filePath, ownerRoot);
  const summary: SessionSummary = {
    id: String(fm.id),
    projectId: String(fm.project_id),
    status: (fm.status as Session["status"]) || "closed",
    taskTitle: truncate(String(fm.task_title || path.basename(filePath, ".md")), MAX_SESSION_TITLE_CHARS),
    goal: truncateOptional(stringOrUndefined(fm.goal), MAX_SESSION_GOAL_CHARS),
    branch: truncateOptional(stringOrUndefined(fm.branch), MAX_STATE_ITEM_CHARS),
    agent: truncateOptional(stringOrUndefined(fm.agent), MAX_STATE_ITEM_CHARS),
    client: truncateOptional(stringOrUndefined(fm.client), MAX_STATE_ITEM_CHARS),
    started: String(fm.started || ""),
    updated: String(fm.updated || fm.started || ""),
    closed: stringOrUndefined(fm.closed),
    closedReason: truncateOptional(stringOrUndefined(fm.closed_reason), MAX_STATE_ITEM_CHARS),
    summary: truncateOptional(stringOrUndefined(fm.summary), MAX_SESSION_SUMMARY_CHARS),
    topics: boundedStrings(arrayOfStrings(fm.topics), 12, MAX_TOPIC_CHARS),
    summaryGeneratedAt: stringOrUndefined(fm.summary_generated_at),
    summarySource: summarySourceOrUndefined(fm.summary_source),
    nextSteps: boundedStrings(arrayOfStrings(fm.next_steps), 5, MAX_STATE_ITEM_CHARS),
    blockers: boundedStrings(arrayOfStrings(fm.blockers), 5, MAX_STATE_ITEM_CHARS),
    touchedFiles: boundedStrings(touchedFiles.slice(-10).reverse(), 10, MAX_PATH_CHARS),
    checkpointCount,
    totalTouchedFiles: touchedFiles.length,
    workstreamIds: boundedStrings(arrayOfStrings(fm.workstream_ids), 12, MAX_ID_CHARS),
    includeInGraph: fm.include_in_graph === true,
    revision: String(fm.updated || fm.started || "")
  };
  SESSION_SUMMARY_CACHE.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, summary });
  return summary;
}

async function listProjectSessionFiles(project: Project): Promise<string[]> {
  return listFiles(path.join(project.memoryRoot, "sessions"), (file) => file.endsWith(".md"));
}

async function findSessionFile(project: Project, sessionId: SessionId): Promise<string | undefined> {
  const files = await listProjectSessionFiles(project);
  for (const file of files) {
    if ((await readSessionSummary(file, project.memoryRoot)).id === sessionId) return file;
  }
  return undefined;
}

async function mutateSessionEffect(
  project: Project,
  sessionId: SessionId,
  effect: DurableDomainEffect,
  expectedRevision: string | undefined,
  mutate: (session: Session) => Session
): Promise<Session> {
  return withProjectSessionEffectLease(project, async () => {
    const session = await getSession(project, sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const reconciled = reconcileEffectOnSession(session, effect);
    if (reconciled) return reconciled;
    if (effect.mode === "reconcile") throw new DomainEffectOutcomeUnknownError();
    if (!expectedRevision || expectedRevision !== sessionDomainRevision(session)) {
      throw new DomainEffectConflictError();
    }

    let next = mutate(session);
    const marker = createDomainEffectMarker({
      effect,
      resultKind: "session",
      resultId: next.id,
      resultRevision: sessionDomainRevision(next),
      committedAt: nowIso()
    });
    next = appendDomainEffectMarker(next, marker, effect);
    await writeSession(next, undefined, project.memoryRoot);
    return next;
  });
}

async function reconcileSessionEffect(
  project: Project,
  effect: DurableDomainEffect
): Promise<Session | undefined> {
  const sessions = await listProjectSessions(project);
  const matches = sessions.filter((session) =>
    getDomainEffectMarkers(session).some((marker) => marker.effectId === effect.effectId)
  );
  if (matches.length > 1) throw new DomainEffectOutcomeUnknownError();
  return matches.length === 1 ? reconcileEffectOnSession(matches[0]!, effect) : undefined;
}

function reconcileEffectOnSession(
  session: Session,
  effect: DurableDomainEffect
): Session | undefined {
  const matches = getDomainEffectMarkers(session)
    .filter((marker) => marker.effectId === effect.effectId);
  if (matches.length === 0) return undefined;
  if (matches.length !== 1) throw new DomainEffectOutcomeUnknownError();
  assertMatchingDomainEffectMarker(effect, matches[0]!, {
    resultKind: "session",
    resultId: session.id,
    // A later session revision must not be reclassified as the result of this
    // older effect. The caller receives outcome_unknown instead of acquiring
    // authority over intervening human or control-plane edits.
    resultRevision: sessionDomainRevision(session)
  });
  return session;
}

export function assertSessionDomainEffect(
  session: Session,
  effect: DurableDomainEffect
): void {
  if (!reconcileEffectOnSession(session, effect)) {
    throw new DomainEffectOutcomeUnknownError();
  }
}

export function sessionDomainEffectStatus(
  session: Session,
  effect: DurableDomainEffect
): "committed" | "absent" {
  return reconcileEffectOnSession(session, effect) ? "committed" : "absent";
}

function withProjectSessionEffectLease<T>(
  project: Project,
  work: () => Promise<T>
): Promise<T> {
  return withStorageMutationLease(
    path.join(project.memoryRoot, "sessions"),
    "domain-effects",
    work
  );
}

export function sessionDomainRevision(session: Session): string {
  return domainValueRevision(storedSessionMarkdown(session, undefined, false));
}

function storedSessionMarkdown(
  session: Session,
  body: string | undefined,
  includeDomainEffects: boolean
): string {
  return formatMarkdown(
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
      closed_reason: session.closedReason,
      task_title: session.taskTitle,
      include_in_graph: session.includeInGraph,
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
      import_profile: session.importProfile,
      checkpoint_count: session.checkpoints.length,
      state_semantics_version: session.stateSemanticsVersion,
      domain_effects: includeDomainEffects ? encodeDomainEffectMarkers(session) : undefined
    },
    body ?? session.body ?? sessionToBody(session)
  );
}

async function readFrontmatterPrefix(filePath: string, ownerRoot?: string): Promise<string> {
  const handle = await fs.open(filePath, "r");
  try {
    await assertSafeOpenedSessionFile(handle, filePath, ownerRoot);
    const chunks: Buffer[] = [];
    let bytesReadTotal = 0;
    const chunkSize = 16 * 1024;
    while (bytesReadTotal < 1024 * 1024) {
      const buffer = Buffer.alloc(chunkSize);
      const { bytesRead } = await handle.read(buffer, 0, chunkSize, bytesReadTotal);
      if (bytesRead === 0) break;
      chunks.push(buffer.subarray(0, bytesRead));
      bytesReadTotal += bytesRead;
      const text = Buffer.concat(chunks).toString("utf8");
      if (text.indexOf("\n---", 4) !== -1) return text;
    }
  } finally {
    await handle.close();
  }
  return readSafeSessionText(filePath, ownerRoot);
}

async function countCheckpointSections(filePath: string, ownerRoot?: string): Promise<number> {
  const raw = await readSafeSessionText(filePath, ownerRoot);
  return [...raw.matchAll(/^#{2,3}\s+(?:Checkpoint\s+-\s+)?\d{4}-\d{2}-\d{2}T[^\n]+$/gm)].length;
}

async function readSafeSessionText(filePath: string, ownerRoot?: string): Promise<string> {
  const handle = await fs.open(filePath, "r");
  try {
    await assertSafeOpenedSessionFile(handle, filePath, ownerRoot);
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

async function assertSafeOpenedSessionFile(
  handle: Awaited<ReturnType<typeof fs.open>>,
  filePath: string,
  ownerRoot?: string
): Promise<void> {
  const stat = await handle.stat();
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 32 * 1024 * 1024) {
    throw new Error("Session file is unsafe or oversized.");
  }
  const current = await fs.lstat(filePath);
  if (
    !current.isFile() || current.isSymbolicLink() || current.nlink !== 1 ||
    current.dev !== stat.dev || current.ino !== stat.ino
  ) {
    throw new Error("Session file changed during safe open.");
  }
  const resolvedRoot = path.resolve(ownerRoot ?? path.dirname(filePath));
  const resolvedParent = path.resolve(path.dirname(filePath));
  if (!isSessionPathContained(resolvedRoot, resolvedParent)) {
    throw new Error("Session file escaped its owner root.");
  }
  await assertLinkFreeSessionDirectory(resolvedParent);
  const [realRoot, realParent, realFile] = await Promise.all([
    fs.realpath(resolvedRoot),
    fs.realpath(resolvedParent),
    fs.realpath(filePath)
  ]);
  if (!isSessionPathContained(realRoot, realFile) ||
    comparableSessionPath(path.dirname(realFile)) !== comparableSessionPath(realParent) ||
    comparableSessionPath(path.basename(realFile)) !== comparableSessionPath(path.basename(filePath))) {
    throw new Error("Session file traverses a filesystem link.");
  }
}

async function assertSafeSessionPath(filePath: string, ownerRoot?: string): Promise<void> {
  const resolvedRoot = path.resolve(ownerRoot ?? path.dirname(filePath));
  const resolvedFile = path.resolve(filePath);
  const resolvedParent = path.dirname(resolvedFile);
  if (!isSessionPathContained(resolvedRoot, resolvedFile)) {
    throw new Error("Session file escaped its owner root.");
  }
  await assertLinkFreeSessionDirectory(resolvedParent);
  const [realRoot, realParent, realFile] = await Promise.all([
    fs.realpath(resolvedRoot),
    fs.realpath(resolvedParent),
    fs.realpath(resolvedFile)
  ]);
  if (!isSessionPathContained(realRoot, realFile) ||
    comparableSessionPath(path.dirname(realFile)) !== comparableSessionPath(realParent) ||
    comparableSessionPath(path.basename(realFile)) !== comparableSessionPath(path.basename(resolvedFile))) {
    throw new Error("Session file traverses a filesystem link.");
  }
}

async function assertLinkFreeSessionDirectory(target: string): Promise<void> {
  const resolved = path.resolve(target);
  const root = path.parse(resolved).root;
  const relative = path.relative(root, resolved);
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("Session file traverses a filesystem link.");
    }
  }
}

function comparableSessionPath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isSessionPathContained(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
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
  const nextSteps = checkpoint.stateFields?.includes("nextSteps")
    ? `\n\nNext steps:\n${checkpoint.nextSteps.map((step) => `- ${step}`).join("\n") || "- None recorded"}`
    : "";
  const blockers = checkpoint.stateFields?.includes("blockers")
    ? `\n\nBlockers:\n${checkpoint.blockers.map((blocker) => `- ${blocker}`).join("\n") || "- None recorded"}`
    : "";
  const section = `## Checkpoint - ${checkpoint.created}

${checkpoint.summary}${nextSteps}${blockers}

Touched files:
${checkpoint.touchedFiles.map((file) => `- ${file}`).join("\n") || "- None recorded"}
`;

  return `${body.trim()}\n\n${section.trim()}\n`;
}

function appendCloseToBody(
  body: string,
  close: { closed: string; summary?: string; nextSteps?: string[]; blockers?: string[]; reason?: string }
): string {
  const reason = close.reason ? `\n\nClose reason: ${close.reason}` : "";
  const nextSteps = close.nextSteps !== undefined
    ? `\n\nNext steps:\n${close.nextSteps.map((step) => `- ${step}`).join("\n") || "- None recorded"}`
    : "";
  const blockers = close.blockers !== undefined
    ? `\n\nBlockers:\n${close.blockers.map((blocker) => `- ${blocker}`).join("\n") || "- None recorded"}`
    : "";
  const section = `## Session Closed - ${close.closed}

${close.summary || "No final summary recorded."}${reason}${nextSteps}${blockers}
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
      proposedUpdateIds: [],
      stateFields: [
        ...(hasList(section, "Next steps") ? ["nextSteps" as const] : []),
        ...(hasList(section, "Blockers") ? ["blockers" as const] : [])
      ]
    };
  });
}

function hasList(section: string, label: string): boolean {
  return section.split(/\r?\n/).some((line) => line.trim().toLowerCase() === `${label.toLowerCase()}:`);
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

function numericOrUndefined(input: unknown): number | undefined {
  return typeof input === "number" && Number.isFinite(input) && input >= 0 ? input : undefined;
}

function boundedStrings(input: string[], maxItems: number, maxChars: number): string[] {
  return input.filter(Boolean).slice(0, maxItems).map((item) => truncate(item, maxChars));
}

function mergeUnique(left: string[], right: string[]): string[] {
  return unique([...left, ...right]);
}
