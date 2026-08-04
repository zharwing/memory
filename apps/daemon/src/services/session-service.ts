import type { ProjectRegistry } from "@zharwing/memory-store";
import {
  closeSession as storageCloseSession,
  getActiveSession,
  getSession,
  listProjectSessionSummaries,
  listProjectSessions,
  movePathToTrash,
  saveCheckpoint,
  startSession,
  updateSessionGraphVisibility as storageUpdateSessionGraphVisibility,
  updateSessionSummary
} from "@zharwing/memory-store";
import {
  callAiProviderJson,
  providerKindFromAssistantRuntime,
  sessionSummaryFromProviderJson,
  sessionSummaryMessages,
  summarizeSessionMetadataDeterministically,
  type AiProviderConfig,
  type SessionSummaryDraft
} from "@zharwing/memory-assistant";
import { applyPrivacyGate } from "@zharwing/memory-privacy";
import {
  isLocalProviderEndpoint,
  localDayKey,
  nowIso,
  type Project,
  type Session,
  type SessionDetail,
  type SessionDetailSection,
  type SessionSummary
} from "@zharwing/memory-core";
import { resolveProject } from "./project-resolver.js";

/** Recorded on sessions the daemon closes at day rollover. */
export const STALE_SESSION_CLOSE_REASON =
  "Auto-closed at day rollover: the session was still active when work resumed on a later day.";

interface StartSessionParams {
  projectId: string;
  repoPath?: string;
  workingDirectory?: string;
  branch?: string;
  agent?: string;
  client?: string;
  taskTitle?: string;
  goal?: string;
  workstreamIds?: string[];
}

export class SessionService {
  constructor(private readonly registry: ProjectRegistry) {}

  async startSession(params: StartSessionParams) {
    const project = await resolveProject(this.registry, params.projectId);
    await this.autoCloseStaleSessions(project);
    return this.createSession(project, params);
  }

  async startOrResumeSession(params: {
    projectId: string;
    taskTitle?: string;
    workingDirectory?: string;
    branch?: string;
    agent?: string;
    client?: string;
    goal?: string;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    // Runs before the resume check on purpose: yesterday's abandoned session
    // must not be handed back as today's active session.
    await this.autoCloseStaleSessions(project);
    const active = await getActiveSession(project);
    if (active && !params.taskTitle) return active;

    return this.createSession(project, {
      projectId: params.projectId,
      workingDirectory: params.workingDirectory,
      branch: params.branch,
      agent: params.agent,
      client: params.client,
      taskTitle: params.taskTitle?.trim() || undefined,
      goal: params.goal
    });
  }

  /**
   * Operator-triggered version of the day-rollover sweep, for cleaning up
   * sessions abandoned by agents without waiting for the next session start.
   */
  async closeStaleSessions(params: { projectId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const closed = await this.autoCloseStaleSessions(project);
    return {
      projectId: project.id,
      closed: closed.length,
      sessionIds: closed.map((session) => session.id)
    };
  }

  /**
   * Closes sessions left active on an earlier local day. Agents routinely exit
   * without an explicit close, so day rollover is treated as the implicit end
   * of that day's work; otherwise abandoned sessions stay active forever and
   * `getActiveSession` keeps resuming an old log instead of starting a new one.
   *
   * Summaries are filled in deterministically only: starting a session must
   * stay fast and must not depend on a local model being reachable.
   */
  async autoCloseStaleSessions(project: Project): Promise<Session[]> {
    const today = localDayKey();
    const summaries = await listProjectSessionSummaries(project);
    const stale = summaries.filter((session) => {
      if (session.status !== "active") return false;
      const day = localDayKey(session.updated || session.started);
      return Boolean(day) && day < today;
    });

    const closed: Session[] = [];
    for (const summary of stale) {
      try {
        const session = await getSession(project, summary.id);
        if (!session) continue;
        // Summarized as it will be stored, so the TLDR does not claim the
        // session is still active.
        const draft = session.summaryGeneratedAt
          ? undefined
          : summarizeSessionMetadataDeterministically({ ...session, status: "closed" });
        closed.push(await storageCloseSession({
          project,
          sessionId: session.id,
          summary: draft?.summary,
          topics: draft?.topics,
          summaryGeneratedAt: draft ? nowIso() : undefined,
          summarySource: draft ? "deterministic" : undefined,
          closedReason: STALE_SESSION_CLOSE_REASON,
          preserveUpdated: true
        }));
      } catch {
        // Housekeeping must never block the session the caller asked for.
      }
    }
    return closed;
  }

  private async createSession(project: Project, params: StartSessionParams) {
    return startSession({
      project,
      repoPath: params.repoPath || project.repos[0]?.path || process.cwd(),
      workingDirectory: params.workingDirectory || process.cwd(),
      branch: params.branch,
      agent: params.agent,
      client: params.client,
      taskTitle: params.taskTitle?.trim() || undefined,
      goal: params.goal,
      workstreamIds: params.workstreamIds
    });
  }

  async listSessions(params: { projectId: string; limit?: number }) {
    const project = await resolveProject(this.registry, params.projectId);
    const sessions = await listProjectSessionSummaries(project);
    return sessions.slice(0, normalizeLimit(params.limit, sessions.length, 200));
  }

  async getActiveSession(params: { projectId: string }) {
    return getActiveSession(await resolveProject(this.registry, params.projectId));
  }

  async getLatestSession(params: { projectId: string }) {
    return (await listProjectSessionSummaries(
      await resolveProject(this.registry, params.projectId)
    ))[0];
  }

  async getSessionDetail(params: {
    projectId: string;
    sessionId: string;
    sections?: SessionDetailSection[];
    checkpointLimit?: number;
    cursor?: string;
  }): Promise<SessionDetail> {
    const project = await resolveProject(this.registry, params.projectId);
    const summaries = await listProjectSessionSummaries(project);
    const summary = summaries.find((session) => session.id === params.sessionId);
    if (!summary) throw new Error(`Session not found: ${params.sessionId}`);
    const requested = normalizeDetailSections(params.sections);
    const detail: SessionDetail = {
      schema: "zharwing.memory.session-detail.v1",
      session: summary
    };
    const fullSession = requested.size > 0
      ? await getSession(project, params.sessionId)
      : undefined;
    if (requested.size > 0 && !fullSession) {
      throw new Error(`Session not found: ${params.sessionId}`);
    }
    if (requested.has("body")) {
      detail.body = fullSession?.body || "";
    }
    if (requested.has("checkpoints")) {
      const limit = normalizeLimit(params.checkpointLimit, 20, 100);
      const offset = decodeCheckpointCursor(params.cursor, summary);
      const checkpoints = [...(fullSession?.checkpoints || [])].reverse();
      detail.checkpoints = checkpoints.slice(offset, offset + limit);
      if (offset + limit < checkpoints.length) {
        detail.nextCursor = encodeCheckpointCursor(offset + limit, summary);
      }
    }
    return detail;
  }

  async saveCheckpoint(params: {
    projectId: string;
    sessionId: string;
    summary: string;
    nextSteps?: string[];
    blockers?: string[];
    touchedFiles?: string[];
    proposedUpdateIds?: string[];
    workstreamIds?: string[];
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    return saveCheckpoint({ project, ...params });
  }

  async updateSessionGraphVisibility(params: {
    projectId: string;
    sessionId: string;
    includeInGraph: boolean;
  }) {
    if (typeof params.includeInGraph !== "boolean") {
      throw new Error("includeInGraph must be a boolean");
    }
    const project = await resolveProject(this.registry, params.projectId);
    return storageUpdateSessionGraphVisibility({ project, ...params });
  }

  async closeSession(params: {
    projectId: string;
    sessionId: string;
    summary?: string;
    nextSteps?: string[];
    blockers?: string[];
    workstreamIds?: string[];
    autoSummarize?: boolean;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const closed = await storageCloseSession({ project, ...params });
    if (params.autoSummarize === false) return closed;
    const generated = await this.generateSessionSummary({
      projectId: params.projectId,
      sessionId: closed.id,
      force: true
    });
    return generated.session;
  }

  async generateSessionSummary(params: {
    projectId: string;
    sessionId: string;
    force?: boolean;
    endpoint?: string;
    model?: string;
    apiKey?: string;
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const session = await getSession(project, params.sessionId);
    if (!session) throw new Error(`Session not found: ${params.sessionId}`);
    if (!params.force && session.summaryGeneratedAt && session.summary) {
      return { session, generated: false, source: session.summarySource || "manual" };
    }

    const { draft, source, model } = await summarizeSessionForStorage(project, session, params);
    const updated = await updateSessionSummary({
      project,
      sessionId: session.id,
      summary: draft.summary,
      topics: draft.topics,
      nextSteps: draft.nextSteps,
      blockers: draft.blockers,
      touchedFiles: draft.touchedFiles,
      summaryGeneratedAt: new Date().toISOString(),
      summarySource: source,
      summaryModel: model
    });
    return {
      session: updated,
      generated: true,
      source,
      model,
      confidence: draft.confidence
    };
  }

  async generateSessionSummaries(params: {
    projectId: string;
    mode?: "missing" | "all";
    limit?: number;
    endpoint?: string;
    model?: string;
    apiKey?: string;
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const sessions = await listProjectSessions(project);
    const mode = params.mode || "missing";
    const candidates = sessions
      .filter((session) => mode === "all" || !session.summaryGeneratedAt)
      .slice(0, params.limit || sessions.length);
    const results = [];
    for (const session of candidates) {
      results.push(await this.generateSessionSummary({
        ...params,
        sessionId: session.id,
        force: mode === "all"
      }));
    }
    return {
      projectId: project.id,
      mode,
      scanned: sessions.length,
      selected: candidates.length,
      generated: results.filter((result) => result.generated).length,
      results
    };
  }

  async deleteSession(params: { projectId: string; sessionId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const session = await getSession(project, params.sessionId);
    if (!session?.filePath) throw new Error(`Session not found: ${params.sessionId}`);
    return movePathToTrash({
      memoryRoot: this.registry.memoryRoot,
      type: "session",
      projectId: project.id,
      projectName: project.name,
      itemId: session.id,
      title: session.taskTitle,
      originalPath: session.filePath,
      critical: session.status === "active",
      details: { status: session.status }
    });
  }
}

async function summarizeSessionForStorage(
  project: Project,
  session: Session,
  params: {
    endpoint?: string;
    model?: string;
    apiKey?: string;
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
  }
): Promise<{
  draft: SessionSummaryDraft;
  source: NonNullable<Session["summarySource"]>;
  model?: string;
}> {
  const provider = assistantProviderConfig(project, params);
  const privacy = applyPrivacyGate(
    {
      id: `session:${session.id}`,
      type: "session",
      title: session.taskTitle,
      visibility: "ai-eligible",
      sourcePath: session.filePath,
      content: session.body || ""
    },
    project.privacyPolicy
  );

  if (provider && privacy.allowed) {
    try {
      const result = await callAiProviderJson(
        provider,
        sessionSummaryMessages(session, privacy.content),
        { schemaName: "session summary", retryOnInvalidJson: true }
      );
      return {
        draft: sessionSummaryFromProviderJson(result.value, session),
        source: "assistant",
        model: result.model || provider.model
      };
    } catch {
      // Close-session should never fail because a local model failed.
    }
  }

  return {
    draft: summarizeSessionMetadataDeterministically(session),
    source: "deterministic",
    model: provider?.model
  };
}

function assistantProviderConfig(
  project: Project,
  params: {
    endpoint?: string;
    model?: string;
    apiKey?: string;
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
  }
): AiProviderConfig | undefined {
  const endpoint = params.endpoint || project.assistantPolicy.endpoint;
  const model = params.model || project.assistantPolicy.modelName;
  if (!project.assistantPolicy.enabled || project.assistantPolicy.runtimeType === "disabled") return undefined;
  if (!endpoint || !model || !isLocalProviderEndpoint(endpoint)) return undefined;
  return {
    providerKind: providerKindFromAssistantRuntime(project.assistantPolicy.runtimeType),
    endpoint,
    model,
    apiKey: params.apiKey,
    timeoutMs: params.timeoutMs || 60000,
    maxOutputTokens: params.maxOutputTokens || 700,
    temperature: 0,
    jsonMode: params.jsonMode ?? false
  };
}

function normalizeLimit(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return Math.min(fallback, maximum);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("limit must be a positive integer");
  }
  return Math.min(value, maximum);
}

function normalizeDetailSections(input: SessionDetailSection[] | undefined): Set<SessionDetailSection> {
  const sections = input || [];
  const allowed = new Set<SessionDetailSection>(["body", "checkpoints"]);
  for (const section of sections) {
    if (!allowed.has(section)) throw new Error(`Unsupported session detail section: ${section}`);
  }
  return new Set(sections);
}

function encodeCheckpointCursor(offset: number, session: SessionSummary): string {
  return Buffer.from(JSON.stringify({
    offset,
    revision: session.revision
  }), "utf8").toString("base64url");
}

function decodeCheckpointCursor(cursor: string | undefined, session: SessionSummary): number {
  if (!cursor) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      offset?: unknown;
      revision?: unknown;
    };
    if (decoded.revision !== session.revision) {
      throw new Error("Session changed while checkpoints were being paginated.");
    }
    if (!Number.isInteger(decoded.offset) || Number(decoded.offset) < 0) {
      throw new Error("Invalid checkpoint cursor.");
    }
    return Number(decoded.offset);
  } catch (error) {
    if (error instanceof Error && (
      error.message === "Session changed while checkpoints were being paginated." ||
      error.message === "Invalid checkpoint cursor."
    )) {
      throw error;
    }
    throw new Error("Invalid checkpoint cursor.");
  }
}
