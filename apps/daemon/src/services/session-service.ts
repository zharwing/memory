import type { ProjectRegistry } from "@aimem/storage";
import {
  closeSession as storageCloseSession,
  getActiveSession,
  getLatestSession,
  getSession,
  listProjectSessions,
  movePathToTrash,
  saveCheckpoint,
  startSession,
  updateSessionSummary
} from "@aimem/storage";
import {
  callAiProviderJson,
  sessionSummaryFromProviderJson,
  sessionSummaryMessages,
  summarizeSessionMetadataDeterministically,
  type AiProviderConfig,
  type SessionSummaryDraft
} from "@aimem/assistant-runtime";
import { applyPrivacyGate } from "@aimem/privacy";
import type { Project, Session } from "@aimem/core";
import { resolveProject } from "./project-resolver.js";

export class SessionService {
  constructor(private readonly registry: ProjectRegistry) {}

  async startSession(params: {
    projectId: string;
    repoPath?: string;
    workingDirectory?: string;
    branch?: string;
    agent?: string;
    client?: string;
    taskTitle?: string;
    goal?: string;
    workstreamIds?: string[];
  }) {
    const project = await resolveProject(this.registry, params.projectId);
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
    const active = await getActiveSession(project);
    if (active && !params.taskTitle) return active;

    return this.startSession({
      projectId: params.projectId,
      workingDirectory: params.workingDirectory,
      branch: params.branch,
      agent: params.agent,
      client: params.client,
      taskTitle: params.taskTitle?.trim() || undefined,
      goal: params.goal
    });
  }

  async listSessions(params: { projectId: string; limit?: number }) {
    const project = await resolveProject(this.registry, params.projectId);
    const sessions = await listProjectSessions(project);
    return sessions.slice(0, params.limit || sessions.length);
  }

  async getActiveSession(params: { projectId: string }) {
    return getActiveSession(await resolveProject(this.registry, params.projectId));
  }

  async getLatestSession(params: { projectId: string }) {
    return getLatestSession(await resolveProject(this.registry, params.projectId));
  }

  async saveCheckpoint(params: {
    projectId: string;
    sessionId: string;
    summary: string;
    nextSteps?: string[];
    blockers?: string[];
    touchedFiles?: string[];
    proposedUpdateIds?: string[];
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    return saveCheckpoint({ project, ...params });
  }

  async closeSession(params: {
    projectId: string;
    sessionId: string;
    summary?: string;
    nextSteps?: string[];
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

function providerKindFromAssistantRuntime(runtimeType?: string): string {
  if (runtimeType === "lm-studio") return "lm-studio";
  if (runtimeType === "ollama") return "ollama";
  if (runtimeType === "llama-cpp" || runtimeType === "app-managed-llamacpp") return "llama-cpp";
  if (runtimeType === "custom-openai-compatible") return "openai-compatible";
  return "openai-compatible";
}

function isLocalProviderEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}
