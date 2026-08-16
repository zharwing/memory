import type { DurableDomainEffect, ProjectRegistry } from "@zharwing/memory-store";
import { SessionRepository } from "@zharwing/memory-store";
import {
  DomainEffectOutcomeUnknownError,
  assertDurableDomainEffect,
  movePathToTrash,
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
  type SessionCheckpoint,
  type SessionDetail,
  type SessionDetailSection,
  type SessionSummary
} from "@zharwing/memory-core";
import { resolveProject } from "./project-resolver.js";
import type { ProviderSecretService } from "./provider-secret-service.js";
import {
  checkpointAuthorityRevision,
  sessionAuthorityRevision,
  SessionAuthorityStore,
  type SessionAuthorityProvenance
} from "./session-visibility.js";

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
  effect?: DurableDomainEffect;
}

export interface AgentSessionWriteGuard {
  readonly projectId: string;
  readonly sessionId: string;
  readonly owner: string;
  readonly baseSession: Session;
  readonly baseRevision: string;
  readonly reconciledEffectId?: string;
}

export class SessionService {
  constructor(
    private readonly registry: ProjectRegistry,
    private readonly sessionAuthority: SessionAuthorityStore,
    private readonly providerSecrets?: ProviderSecretService,
    private readonly sessions: SessionRepository = new SessionRepository()
  ) {}

  async startSession(params: StartSessionParams) {
    const project = await resolveProject(this.registry, params.projectId);
    await this.autoCloseStaleSessions(project);
    return this.createSession(project, params);
  }

  /** Agent creation never performs implicit housekeeping on human sessions. */
  async startAgentSession(params: StartSessionParams) {
    const project = await resolveProject(this.registry, params.projectId);
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
    const active = await this.sessions.getActiveSession(project);
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
    const summaries = await this.sessions.listProjectSessionSummaries(project);
    const stale = summaries.filter((session) => {
      if (session.status !== "active") return false;
      const day = localDayKey(session.updated || session.started);
      return Boolean(day) && day < today;
    });

    const closed: Session[] = [];
    for (const summary of stale) {
      try {
        const session = await this.sessions.getSession(project, summary.id);
        if (!session) continue;
        // Summarized as it will be stored, so the TLDR does not claim the
        // session is still active.
        const draft = session.summaryGeneratedAt
          ? undefined
          : summarizeSessionMetadataDeterministically({ ...session, status: "closed" });
        closed.push(await this.sessions.closeSession({
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
    return this.sessions.startSession({
      project,
      repoPath: params.repoPath || project.repos[0]?.path || process.cwd(),
      workingDirectory: params.workingDirectory || process.cwd(),
      branch: params.branch,
      agent: params.agent,
      client: params.client,
      taskTitle: params.taskTitle?.trim() || undefined,
      goal: params.goal,
      workstreamIds: params.workstreamIds,
      effect: params.effect
    });
  }

  async listSessions(params: { projectId: string; limit?: number }) {
    const project = await resolveProject(this.registry, params.projectId);
    const sessions = await this.sessions.listProjectSessionSummaries(project);
    return this.sessionAuthority.applyVisibilities(
      project,
      sessions.slice(0, normalizeLimit(params.limit, sessions.length, 200))
    );
  }

  async getActiveSession(params: { projectId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const session = await this.sessions.getActiveSession(project);
    return session ? this.sessionAuthority.applyVisibility(project, session) : session;
  }

  async getLatestSession(params: { projectId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const session = (await this.sessions.listProjectSessionSummaries(project))[0];
    return session ? this.sessionAuthority.applyVisibility(project, session) : session;
  }

  async getSessionDetail(params: {
    projectId: string;
    sessionId: string;
    sections?: SessionDetailSection[];
    checkpointLimit?: number;
    cursor?: string;
  }): Promise<SessionDetail> {
    const project = await resolveProject(this.registry, params.projectId);
    const summaries = await this.sessions.listProjectSessionSummaries(project);
    const summary = summaries.find((session) => session.id === params.sessionId);
    if (!summary) throw new Error(`Session not found: ${params.sessionId}`);
    const requested = normalizeDetailSections(params.sections);
    const detail: SessionDetail = {
      schema: "zharwing.memory.session-detail.v1",
      session: summary
    };
    // Authority is bound to the complete immutable classified revision, not
    // the summary timestamp. Always load the full record before attaching
    // visibility so a later body-only/control-plane write fails closed.
    const fullSession = await this.sessions.getSession(project, params.sessionId);
    if (!fullSession) {
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
    const classifiedFullSession = await this.sessionAuthority.applyVisibility(project, fullSession);
    const visibleSession = classifiedFullSession.visibility
      ? { ...detail.session, visibility: classifiedFullSession.visibility }
      : detail.session;
    const classifiedCheckpoints = detail.checkpoints
      ? await this.sessionAuthority.applyCheckpointVisibilities(
          project,
          fullSession.id,
          detail.checkpoints
        )
      : undefined;
    return {
      ...detail,
      session: visibleSession,
      ...(classifiedCheckpoints ? {
        // Checkpoint authority is independent. Never inherit a session-level
        // grant onto a later human/control-plane checkpoint.
        checkpoints: classifiedCheckpoints
      } : {})
    };
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
    effect?: DurableDomainEffect;
    effectBaseRevision?: string;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const { effectBaseRevision, ...input } = params;
    return this.sessions.saveCheckpoint({
      project,
      ...input,
      ...(effectBaseRevision ? { expectedRevision: effectBaseRevision } : {})
    });
  }

  /**
   * Classifies only the record just created by an admitted agent operation.
   * Existing human/legacy sessions remain unclassified and therefore hidden
   * from hardened agent projection until an explicit migration/review.
   */
  async classifyAgentWrittenSession(params: {
    projectId: string;
    sessionId: string;
    owner: string;
    provenance: SessionAuthorityProvenance;
    writtenSession: Session;
    writeGuard?: AgentSessionWriteGuard;
    admittedInput?: Readonly<Record<string, unknown>>;
    effect?: DurableDomainEffect;
  }): Promise<Session> {
    const project = await resolveProject(this.registry, params.projectId);
    const session = await this.sessions.getSession(project, params.sessionId);
    if (!session) throw new Error(`Session not found: ${params.sessionId}`);
    if (
      params.writtenSession.id !== params.sessionId ||
      params.writtenSession.projectId !== params.projectId ||
      sessionAuthorityRevision(session) !== sessionAuthorityRevision(params.writtenSession)
    ) {
      throw new Error("Session changed before authority classification.");
    }
    if (params.effect) {
      const expectedOperation = params.provenance === "agent-start-session"
        ? "memory.start_session"
        : params.provenance === "agent-save-checkpoint"
          ? "memory.save_checkpoint"
          : "memory.close_session";
      assertDurableDomainEffect(params.effect, project, expectedOperation);
      this.sessions.assertSessionDomainEffect(session, params.effect);
    }
    if (params.provenance === "agent-start-session") {
      if (params.writeGuard) throw new Error("Agent start classification cannot use an existing-session guard.");
    } else {
      const guard = params.writeGuard;
      if (
        !guard ||
        guard.projectId !== params.projectId ||
        guard.sessionId !== params.sessionId ||
        guard.owner !== params.owner
      ) {
        throw new Error("Agent session transition guard is missing or mismatched.");
      }
      if (guard.reconciledEffectId) {
        if (!params.effect || guard.reconciledEffectId !== params.effect.effectId) {
          throw new Error("Reconciled session effect guard is mismatched.");
        }
      } else if (params.provenance === "agent-save-checkpoint") {
        assertAgentCheckpointTransition(
          guard.baseSession,
          params.writtenSession,
          params.admittedInput
        );
      } else {
        assertAgentCloseTransition(
          guard.baseSession,
          params.writtenSession,
          params.admittedInput
        );
      }
    }
    const summary = (await this.sessions.listProjectSessionSummaries(project))
      .find((candidate) => candidate.id === session.id);
    if (!summary) throw new Error(`Session summary not found: ${params.sessionId}`);
    await this.sessionAuthority.recordAgentOwnedRevision(
      project,
      session,
      summary,
      params.owner,
      params.provenance,
      () => this.sessions.getSession(project, session.id)
    );
    const classified = await this.sessionAuthority.applyVisibility(project, session);
    return {
      ...classified,
      checkpoints: await this.sessionAuthority.applyCheckpointVisibilities(
        project,
        session.id,
        session.checkpoints
      )
    };
  }

  async assertAgentOwnsSession(params: {
    projectId: string;
    sessionId: string;
    owner: string;
    effect?: DurableDomainEffect;
  }): Promise<AgentSessionWriteGuard> {
    const project = await resolveProject(this.registry, params.projectId);
    const session = await this.sessions.getSession(project, params.sessionId);
    if (session && params.effect?.mode === "reconcile") {
      if (
        params.effect.operation !== "memory.save_checkpoint" &&
        params.effect.operation !== "memory.close_session"
      ) {
        throw new Error("Agent session reconciliation operation is invalid.");
      }
      assertDurableDomainEffect(params.effect, project, params.effect.operation);
      if (this.sessions.sessionDomainEffectStatus(session, params.effect) === "committed") {
        return Object.freeze({
          projectId: project.id,
          sessionId: session.id,
          owner: params.owner,
          baseSession: session,
          baseRevision: this.sessions.sessionDomainRevision(session),
          reconciledEffectId: params.effect.effectId
        });
      }
      throw new DomainEffectOutcomeUnknownError();
    }
    if (
      !session ||
      !await this.sessionAuthority.isAgentOwnedRevision(project, session, params.owner)
    ) {
      throw new Error("Agent session authority refused.");
    }
    return Object.freeze({
      projectId: project.id,
      sessionId: session.id,
      owner: params.owner,
      baseSession: session,
      baseRevision: this.sessions.sessionDomainRevision(session)
    });
  }

  async updateSessionGraphVisibility(params: {
    projectId: string;
    sessionId: string;
    includeInGraph: boolean;
    compact?: boolean;
  }) {
    if (typeof params.includeInGraph !== "boolean") {
      throw new Error("includeInGraph must be a boolean");
    }
    const project = await resolveProject(this.registry, params.projectId);
    const updated = await this.sessions.updateSessionGraphVisibility({
      project,
      sessionId: params.sessionId,
      includeInGraph: params.includeInGraph
    });
    if (params.compact && updated.filePath) {
      return this.sessionAuthority.applyVisibility(
        project,
        await this.sessions.readSessionSummary(updated.filePath, project.memoryRoot)
      );
    }
    return this.sessionAuthority.applyVisibility(project, updated);
  }

  async closeSession(params: {
    projectId: string;
    sessionId: string;
    summary?: string;
    nextSteps?: string[];
    blockers?: string[];
    workstreamIds?: string[];
    includeInGraph?: boolean;
    compact?: boolean;
    autoSummarize?: boolean;
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
    effect?: DurableDomainEffect;
    effectBaseRevision?: string;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    if (params.effect && params.autoSummarize !== false) {
      throw new Error("Durable agent close cannot include a follow-up summary mutation.");
    }
    if (params.autoSummarize === false) {
      const closed = await this.sessions.closeSession({
        project,
        sessionId: params.sessionId,
        summary: params.summary,
        nextSteps: params.nextSteps,
        blockers: params.blockers,
        workstreamIds: params.workstreamIds,
        includeInGraph: params.includeInGraph,
        effect: params.effect,
        ...(params.effectBaseRevision ? { expectedRevision: params.effectBaseRevision } : {})
      });
      if (params.compact && closed.filePath) {
        return this.sessionAuthority.applyVisibility(
          project,
          await this.sessions.readSessionSummary(closed.filePath, project.memoryRoot)
        );
      }
      return this.sessionAuthority.applyVisibility(project, closed);
    }

    const session = await this.sessions.getSession(project, params.sessionId);
    if (!session) throw new Error(`Session not found: ${params.sessionId}`);
    const summaryInput: Session = {
      ...session,
      status: "closed",
      summary: params.summary?.trim() || session.summary,
      nextSteps: params.nextSteps ?? session.nextSteps,
      blockers: params.blockers ?? session.blockers,
      includeInGraph: params.includeInGraph ?? session.includeInGraph,
      workstreamIds: mergeUniqueStrings(session.workstreamIds, params.workstreamIds || [])
    };
    const generated = await summarizeSessionForStorage(
      project,
      summaryInput,
      params,
      this.providerSecrets
    );
    const closed = await this.sessions.closeSession({
      project,
      sessionId: params.sessionId,
      summary: generated.draft.summary,
      closeoutSummary: params.summary,
      topics: generated.draft.topics,
      nextSteps: generated.draft.nextSteps,
      blockers: generated.draft.blockers,
      touchedFiles: generated.draft.touchedFiles,
      workstreamIds: params.workstreamIds,
      includeInGraph: params.includeInGraph,
      summaryGeneratedAt: nowIso(),
      summarySource: generated.source,
      summaryModel: generated.model,
      expectedRevision: this.sessions.sessionDomainRevision(session)
    });
    if (params.compact && closed.filePath) {
      return this.sessionAuthority.applyVisibility(
        project,
        await this.sessions.readSessionSummary(closed.filePath, project.memoryRoot)
      );
    }
    return this.sessionAuthority.applyVisibility(project, closed);
  }

  async generateSessionSummary(params: {
    projectId: string;
    sessionId: string;
    force?: boolean;
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const session = await this.sessions.getSession(project, params.sessionId);
    if (!session) throw new Error(`Session not found: ${params.sessionId}`);
    if (!params.force && session.summaryGeneratedAt && session.summary) {
      return { session, generated: false, source: session.summarySource || "manual" };
    }

    const { draft, source, model } = await summarizeSessionForStorage(
      project,
      session,
      params,
      this.providerSecrets
    );
    const updated = await this.sessions.updateSessionSummary({
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
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const sessions = await this.sessions.listProjectSessions(project);
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
    const session = await this.sessions.getSession(project, params.sessionId);
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
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
  },
  providerSecrets?: ProviderSecretService
): Promise<{
  draft: SessionSummaryDraft;
  source: NonNullable<Session["summarySource"]>;
  model?: string;
}> {
  const provider = assistantProviderConfig(project, params, providerSecrets);
  const privacy = applyPrivacyGate(
    {
      id: `session:${session.id}`,
      type: "session",
      title: session.taskTitle,
      // Provider preparation is a restricted surface too. Missing legacy
      // classification stays review-required rather than being upgraded by
      // this adapter immediately before the privacy gate.
      visibility: session.visibility ?? "review-required",
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
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
  },
  providerSecrets?: ProviderSecretService
): AiProviderConfig | undefined {
  const endpoint = project.assistantPolicy.endpoint;
  const model = project.assistantPolicy.modelName;
  if (!project.assistantPolicy.enabled || project.assistantPolicy.runtimeType === "disabled") return undefined;
  if (!endpoint || !model || !isLocalProviderEndpoint(endpoint)) return undefined;
  const providerKind = providerKindFromAssistantRuntime(project.assistantPolicy.runtimeType);
  if (!providerKind) return undefined;
  return {
    providerKind,
    endpoint,
    model,
    apiKey: providerSecrets?.read(
      project.id,
      providerKind
    ),
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

function assertAgentCheckpointTransition(
  base: Session,
  written: Session,
  input: Readonly<Record<string, unknown>> | undefined
): void {
  if (!input || typeof input.summary !== "string" || typeof base.body !== "string") {
    throw new Error("Agent checkpoint transition input is incomplete.");
  }
  if (written.checkpoints.length !== base.checkpoints.length + 1) {
    throw new Error("Agent checkpoint transition must append exactly one checkpoint.");
  }
  for (let index = 0; index < base.checkpoints.length; index += 1) {
    if (
      checkpointAuthorityRevision(base.checkpoints[index]!) !==
      checkpointAuthorityRevision(written.checkpoints[index]!)
    ) {
      throw new Error("Agent checkpoint transition changed the checkpoint prefix.");
    }
  }
  const checkpoint = written.checkpoints.at(-1)!;
  const expectedCheckpoint: SessionCheckpoint = {
    id: checkpoint.id,
    created: checkpoint.created,
    summary: input.summary,
    nextSteps: stringArray(input.nextSteps),
    blockers: stringArray(input.blockers),
    touchedFiles: stringArray(input.touchedFiles),
    proposedUpdateIds: stringArray(input.proposedUpdateIds),
    stateFields: [
      ...(Object.prototype.hasOwnProperty.call(input, "nextSteps")
        ? ["nextSteps" as const]
        : []),
      ...(Object.prototype.hasOwnProperty.call(input, "blockers")
        ? ["blockers" as const]
        : [])
    ]
  };
  if (
    checkpointAuthorityRevision(checkpoint) !==
    checkpointAuthorityRevision(expectedCheckpoint)
  ) {
    throw new Error("Agent checkpoint transition does not match admitted input.");
  }
  const expected: Session = {
    ...base,
    updated: checkpoint.created,
    summary: input.summary,
    nextSteps: Object.prototype.hasOwnProperty.call(input, "nextSteps")
      ? mergeUniqueStrings([], expectedCheckpoint.nextSteps)
      : base.nextSteps,
    blockers: Object.prototype.hasOwnProperty.call(input, "blockers")
      ? mergeUniqueStrings([], expectedCheckpoint.blockers)
      : base.blockers,
    touchedFiles: mergeUniqueStrings(base.touchedFiles, expectedCheckpoint.touchedFiles),
    workstreamIds: mergeUniqueStrings(base.workstreamIds, stringArray(input.workstreamIds)),
    checkpoints: [...base.checkpoints, expectedCheckpoint],
    body: appendAdmittedCheckpoint(base.body, expectedCheckpoint),
    stateSemanticsVersion: 2
  };
  if (sessionAuthorityRevision(expected) !== sessionAuthorityRevision(written)) {
    throw new Error("Agent checkpoint transition contains an unadmitted session change.");
  }
}

function assertAgentCloseTransition(
  base: Session,
  written: Session,
  input: Readonly<Record<string, unknown>> | undefined
): void {
  if (!input || typeof base.body !== "string" || !written.closed) {
    throw new Error("Agent close transition input is incomplete.");
  }
  if (
    written.checkpoints.length !== base.checkpoints.length ||
    written.checkpoints.some((checkpoint, index) =>
      checkpointAuthorityRevision(checkpoint) !==
      checkpointAuthorityRevision(base.checkpoints[index]!)
    )
  ) {
    throw new Error("Agent close transition changed checkpoint history.");
  }
  const summary = typeof input.summary === "string" ? input.summary : undefined;
  const nextSteps = Object.prototype.hasOwnProperty.call(input, "nextSteps")
    ? stringArray(input.nextSteps)
    : undefined;
  const blockers = Object.prototype.hasOwnProperty.call(input, "blockers")
    ? stringArray(input.blockers)
    : undefined;
  const expected: Session = {
    ...base,
    status: "closed",
    summary: summary || base.summary,
    summarySource: summary ? "manual" : base.summarySource,
    nextSteps: nextSteps === undefined ? base.nextSteps : mergeUniqueStrings([], nextSteps),
    blockers: blockers === undefined ? base.blockers : mergeUniqueStrings([], blockers),
    workstreamIds: mergeUniqueStrings(base.workstreamIds, stringArray(input.workstreamIds)),
    updated: written.closed,
    closed: written.closed,
    closedReason: base.closedReason,
    body: appendAdmittedClose(base.body, {
      closed: written.closed,
      summary,
      nextSteps,
      blockers
    }),
    stateSemanticsVersion: 2
  };
  if (
    written.updated !== written.closed ||
    sessionAuthorityRevision(expected) !== sessionAuthorityRevision(written)
  ) {
    throw new Error("Agent close transition contains an unadmitted session change.");
  }
}

function appendAdmittedCheckpoint(body: string, checkpoint: SessionCheckpoint): string {
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

function appendAdmittedClose(
  body: string,
  close: {
    closed: string;
    summary?: string;
    nextSteps?: string[];
    blockers?: string[];
  }
): string {
  const nextSteps = close.nextSteps !== undefined
    ? `\n\nNext steps:\n${close.nextSteps.map((step) => `- ${step}`).join("\n") || "- None recorded"}`
    : "";
  const blockers = close.blockers !== undefined
    ? `\n\nBlockers:\n${close.blockers.map((blocker) => `- ${blocker}`).join("\n") || "- None recorded"}`
    : "";
  const section = `## Session Closed - ${close.closed}

${close.summary || "No final summary recorded."}${nextSteps}${blockers}
`;
  return `${body.trim()}\n\n${section.trim()}\n`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mergeUniqueStrings(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])];
}
