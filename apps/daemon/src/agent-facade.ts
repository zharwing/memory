import {
  DEFAULT_PRIVACY_POLICY,
  createPublicError,
  getOperationDefinition,
  isAgentOperationName,
  parseAgentOperationResult,
  parseOperationOutput,
  rpcError,
  rpcOk,
  type ContextBundle,
  type ContextIncludedItem,
  type AgentOperationName,
  type RpcResponse,
  type RpcSuccess,
  type SearchResult
} from "@zharwing/memory-core";
import { MEMORY_TOOLS } from "@zharwing/memory-mcp";
import { applyPrivacyGate, projectStructuredResult } from "@zharwing/memory-privacy";
import type { MemoryService } from "./memory-service.js";
import { dispatchAuthorizedRpc, dispatchRpc, type RpcRequest } from "./rpc.js";
import type { AuthorizedInvocation } from "./services/operation-registrar.js";

export const MEMORY_BUNDLE_SCHEMA = "zharwing.memory.bundle.v1";
export const DEFAULT_BUNDLE_TOKEN_BUDGET = 4000;

export interface AgentBundleSection {
  id: string;
  type: ContextIncludedItem["type"];
  title: string;
  sourcePath?: string;
  visibility: ContextIncludedItem["visibility"];
  reason: string;
  mode: ContextIncludedItem["mode"];
  content: string;
  tokenEstimate: number;
}

export interface AgentBundle {
  schema: typeof MEMORY_BUNDLE_SCHEMA;
  status: "ok";
  projectId: string;
  sessionId?: string;
  created: string;
  idempotencyKey?: string;
  budget: { maxTokens: number; usedTokens: number; truncated: boolean };
  sections: AgentBundleSection[];
  completeness: AgentProjectionCompleteness;
  safetyStatus: ContextBundle["safetyStatus"];
}

export interface AgentProjectionCompleteness {
  status: "complete" | "partial";
  excludedItems: number;
  redactions: number;
  truncatedItems: number;
}

export interface AgentProjectedResult {
  schema: "zharwing.agent-projection.v1";
  status: "ok";
  data: unknown;
  completeness: AgentProjectionCompleteness;
}

const AGENT_SAFE_METHODS = new Set(MEMORY_TOOLS.map((tool) => tool.rpcMethod));

/**
 * MCP is the normal AI memory surface, not a second restricted data model.
 * The selected project's sessions, paths, and routine metadata are visible by
 * default. The context/search paths still honor explicit visibility exclusions,
 * never-send patterns, and secret redaction.
 */
export function agentSafeMethods(): string[] {
  return [...AGENT_SAFE_METHODS];
}

export function isAgentSafeMethod(method: string): boolean {
  return AGENT_SAFE_METHODS.has(method);
}

/**
 * Hardened agent entrypoint. The caller must present a registrar-produced
 * invocation; raw method names, params, credentials, and caller-provided
 * audience claims never reach this boundary.
 *
 * The domain result is decoded by the shared operation contract first and is
 * then crossed through the one structured privacy projector. Only projected
 * data is serialized. Projection provenance remains daemon-owned evidence so
 * principal/session identifiers cannot become agent-visible diagnostics.
 */
export async function dispatchAuthorizedAgentRpc(
  service: MemoryService,
  invocation: AuthorizedInvocation
): Promise<RpcResponse> {
  if (
    invocation.principal.audience !== "agent" ||
    !isAgentOperationName(invocation.name) ||
    !isAgentSafeMethod(invocation.name) ||
    getOperationDefinition(invocation.name).privacyProjection !== "agent"
  ) {
    return rpcError(invocation.requestId, createPublicError("forbidden"));
  }

  const projectId = invocation.projectId ?? invocation.principal.projectId ?? undefined;
  let policy = DEFAULT_PRIVACY_POLICY;
  if (invocation.name !== "memory.health") {
    // Every agent data operation is project-bound in hardened-local, including
    // startup discovery whose public input remains optional for compatibility.
    if (!projectId) return rpcError(invocation.requestId, createPublicError("forbidden"));
    try {
      // Resolve policy before dispatch so a policy lookup failure cannot turn a
      // successfully committed mutation into a misleading response failure.
      policy = (await service.getProject(projectId)).privacyPolicy;
    } catch {
      return rpcError(invocation.requestId, createPublicError("forbidden"));
    }
  }

  let sessionWriteGuard:
    | Awaited<ReturnType<MemoryService["assertAgentOwnsSession"]>>
    | undefined;
  if (invocation.name === "memory.save_checkpoint" || invocation.name === "memory.close_session") {
    const sessionId = (invocation.input as Record<string, unknown>).sessionId;
    if (!projectId || typeof sessionId !== "string") {
      return rpcError(invocation.requestId, createPublicError("forbidden"));
    }
    try {
      sessionWriteGuard = await service.assertAgentOwnsSession({
        projectId,
        sessionId,
        owner: invocation.principal.sessionOwner
      });
    } catch {
      return rpcError(invocation.requestId, createPublicError("forbidden"));
    }
  }

  const response = invocation.name === "memory.start_session"
    ? await dispatchAgentStartSession(service, invocation)
    : invocation.name === "memory.close_session"
      ? await dispatchAgentCloseSession(service, invocation)
    : isContextBundleOperation(invocation.name)
      ? await dispatchAgentContextOperation(service, invocation)
      : await dispatchAuthorizedRpc(service, invocation);
  if (!response.ok) return response;

  let authorizedResult = response.result;
  if (
    invocation.name === "memory.start_session" ||
    invocation.name === "memory.save_checkpoint" ||
    invocation.name === "memory.close_session"
  ) {
    const sessionId = resultSessionId(response.result);
    if (!projectId || !sessionId) {
      return rpcError(invocation.requestId, createPublicError("outcome_unknown"));
    }
    try {
      authorizedResult = await service.classifyAgentWrittenSession({
        projectId,
        sessionId,
        owner: invocation.principal.sessionOwner,
        writtenSession: response.result as Parameters<
          MemoryService["classifyAgentWrittenSession"]
        >[0]["writtenSession"],
        ...(sessionWriteGuard ? { writeGuard: sessionWriteGuard } : {}),
        admittedInput: invocation.input as Readonly<Record<string, unknown>>,
        provenance: invocation.name === "memory.start_session"
          ? "agent-start-session"
          : invocation.name === "memory.save_checkpoint"
            ? "agent-save-checkpoint"
            : "agent-close-session"
      });
    } catch {
      // The domain write may already be durable. Never invite a blind retry
      // that could create a second session/checkpoint.
      return rpcError(invocation.requestId, createPublicError("outcome_unknown"));
    }
  }

  const projectionInput = isContextBundleOperation(invocation.name)
    ? projectBundleForAgent(authorizedResult as ContextBundle, {
        maxTokens: normalizeBudget((invocation.input as Record<string, unknown>).maxTokens),
        idempotencyKey: invocation.idempotencyKey
      })
    : prepareAgentProjectionInput(invocation.name, authorizedResult);
  const projected = projectStructuredResult(projectionInput, {
    principal: invocation.principal,
    projectId,
    surface: "agent",
    policy,
    profile: "hardened-local",
    operation: invocation.name,
    limits: {
      maxItems: 2_000,
      maxBytes: getOperationDefinition(invocation.name).maximumResponseBytes,
      maxDepth: 32
    }
  });
  if (!projected.allowed) {
    // A projection refusal must not rewrite a known committed effect into a
    // failure. Agent outputs are intentionally an untyped JSON surface, so a
    // bounded acknowledgement preserves truthful effect state without
    // disclosing the rejected entity. Reads remain default-deny.
    if (getOperationDefinition(invocation.name).effect !== "read") {
      return finalizeAgentResult(response, invocation.name, projectId, {
        status: "accepted",
        operation: invocation.name,
        ...(projectId ? { projectId } : {}),
        resultVisibility: "withheld"
      });
    }
    return rpcError(invocation.requestId, createPublicError("forbidden"));
  }
  if (isAgentBundle(projected.data)) {
    const bundle = projected.data;
    return finalizeAgentResult(response, invocation.name, projectId, {
        ...bundle,
        completeness: {
          status:
            bundle.completeness.status === "complete" && projected.completeness.status === "complete"
              ? "complete"
              : "partial",
          excludedItems: bundle.completeness.excludedItems + projected.completeness.excludedItems,
          redactions: bundle.completeness.redactions +
            projected.redactions.reduce((total, item) => total + item.count, 0),
          truncatedItems: bundle.completeness.truncatedItems + projected.completeness.truncatedItems
        }
      } satisfies AgentBundle);
  }
  const publicData = normalizeAgentProjectionData(invocation.name, projected.data, projectId);
  return finalizeAgentResult(response, invocation.name, projectId, {
      schema: "zharwing.agent-projection.v1",
      status: "ok",
      data: publicData,
      completeness: {
        status: projected.completeness.status === "complete" ? "complete" : "partial",
        excludedItems: projected.completeness.excludedItems,
        redactions: projected.redactions.reduce((total, item) => total + item.count, 0),
        truncatedItems: projected.completeness.truncatedItems
      }
    } satisfies AgentProjectedResult);
}

function finalizeAgentResult(
  response: RpcSuccess,
  operation: AgentOperationName,
  projectId: string | undefined,
  candidate: unknown
): RpcResponse {
  try {
    return { ...response, result: parseAgentOperationResult(operation, candidate) };
  } catch {
    if (getOperationDefinition(operation).effect === "read") {
      return rpcError(response.id, createPublicError("internal"));
    }
    try {
      return {
        ...response,
        result: parseAgentOperationResult(operation, {
          status: "accepted",
          operation,
          ...(projectId ? { projectId } : {}),
          resultVisibility: "withheld"
        })
      };
    } catch {
      return rpcError(response.id, createPublicError("outcome_unknown"));
    }
  }
}

async function dispatchAgentStartSession(
  service: MemoryService,
  invocation: AuthorizedInvocation
): Promise<RpcResponse> {
  try {
    const result = await service.startAgentSession(
      invocation.input as Parameters<MemoryService["startAgentSession"]>[0]
    );
    return rpcOk(
      invocation.requestId,
      parseOperationOutput("memory.start_session", result)
    );
  } catch {
    return rpcError(invocation.requestId, createPublicError("internal"));
  }
}

async function dispatchAgentCloseSession(
  service: MemoryService,
  invocation: AuthorizedInvocation
): Promise<RpcResponse> {
  try {
    // Hardened agent close classification authorizes one exact close
    // transition. Provider/deterministic summary follow-up is a separate
    // control-plane mutation and cannot be folded into this authority grant.
    const result = await service.closeSession({
      ...(invocation.input as Parameters<MemoryService["closeSession"]>[0]),
      autoSummarize: false
    });
    return rpcOk(
      invocation.requestId,
      parseOperationOutput("memory.close_session", result)
    );
  } catch {
    return rpcError(invocation.requestId, createPublicError("internal"));
  }
}

export async function dispatchAgentRpc(service: MemoryService, request: RpcRequest): Promise<RpcResponse> {
  if (!isAgentSafeMethod(request.method)) {
    return rpcError(request.id, createPublicError("forbidden"));
  }

  try {
    if (request.method === "memory.health") {
      return { id: request.id, ok: true, result: { status: "ok" } };
    }
    if (request.method === "memory.search") {
      return { id: request.id, ok: true, result: await searchAgentMemory(service, request.params || {}) };
    }
    if (request.method === "memory.preview_context_bundle") {
      return { id: request.id, ok: true, result: await getAgentContextBundle(service, request.params || {}, false) };
    }
    if (request.method === "memory.get_context_bundle") {
      return { id: request.id, ok: true, result: await getAgentContextBundle(service, request.params || {}, true) };
    }

    return sanitizeRpcResponse(await dispatchRpc(service, request));
  } catch (error) {
    return rpcError(
      request.id,
      createPublicError(error instanceof AgentInputError ? "validation" : "internal")
    );
  }
}

async function searchAgentMemory(
  service: MemoryService,
  params: Record<string, unknown>
): Promise<SearchResult[]> {
  const projectId = requiredString(params, "projectId");
  const query = requiredString(params, "query");
  const project = await service.getProject(projectId);
  const results = await service.search({ projectId, query });
  const visible: SearchResult[] = [];

  for (const result of results) {
    const decision = applyPrivacyGate(
      {
        id: result.id,
        projectId,
        type: result.type,
        title: result.title,
        sourcePath: result.path,
        visibility: result.visibility || "ai-eligible",
        content: JSON.stringify({ title: result.title, snippet: result.snippet })
      },
      project.privacyPolicy
    );
    if (!decision.allowed) continue;

    const projected = JSON.parse(decision.content) as { title: string; snippet: string };
    visible.push({ ...result, title: projected.title, snippet: projected.snippet });
  }

  return visible;
}

async function getAgentContextBundle(
  service: MemoryService,
  params: Record<string, unknown>,
  persist: boolean
): Promise<AgentBundle> {
  const projectId = requiredString(params, "projectId");
  const request = {
    projectId,
    sessionId: optionalString(params.sessionId),
    taskText: optionalString(params.taskText),
    requestedBy: optionalString(params.requestedBy) || "agent"
  };
  const bundle = persist
    ? await service.getContextBundle(request)
    : await service.previewContextBundle(request);

  return projectBundleForAgent(bundle, {
    maxTokens: normalizeBudget(params.maxTokens),
    idempotencyKey: optionalString(params.idempotencyKey)
  });
}

export function projectBundleForAgent(
  bundle: ContextBundle,
  options: { maxTokens: number; idempotencyKey?: string }
): AgentBundle {
  const sections: AgentBundleSection[] = [];
  let usedTokens = 0;
  let truncated = false;
  for (const item of bundle.includedItems) {
    const tokenEstimate = item.tokenEstimate || Math.ceil(item.content.length / 4);
    if (usedTokens + tokenEstimate > options.maxTokens) {
      truncated = true;
      continue;
    }
    sections.push({
      id: item.id,
      type: item.type,
      title: item.title,
      sourcePath: item.sourcePath,
      visibility: item.visibility,
      reason: item.reason,
      mode: item.mode,
      content: item.content,
      tokenEstimate
    });
    usedTokens += tokenEstimate;
  }
  return {
    schema: MEMORY_BUNDLE_SCHEMA,
    status: "ok",
    projectId: bundle.projectId,
    ...(bundle.sessionId ? { sessionId: bundle.sessionId } : {}),
    created: bundle.created,
    ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    budget: { maxTokens: options.maxTokens, usedTokens, truncated },
    sections,
    completeness: {
      status: truncated || bundle.excludedItems.length > 0 ? "partial" : "complete",
      excludedItems: bundle.excludedItems.length,
      redactions: bundle.redactions.reduce((total, item) => total + item.count, 0),
      truncatedItems: truncated ? Math.max(0, bundle.includedItems.length - sections.length) : 0
    },
    safetyStatus: bundle.safetyStatus
  };
}

function isAgentBundle(value: unknown): value is AgentBundle {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).schema === MEMORY_BUNDLE_SCHEMA
  );
}

function sanitizeRpcResponse(response: RpcResponse): RpcResponse {
  if (response.ok) return response;
  return rpcError(response.id, createPublicError(response.error.code));
}

class AgentInputError extends Error {}

function requiredString(params: Record<string, unknown>, key: string): string {
  const value = optionalString(params[key]);
  if (!value) throw new AgentInputError(`${key} is required`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeBudget(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_BUNDLE_TOKEN_BUDGET;
  return Math.min(parsed, 32_000);
}

function isContextBundleOperation(
  operation: string
): operation is "memory.preview_context_bundle" | "memory.get_context_bundle" {
  return operation === "memory.preview_context_bundle" || operation === "memory.get_context_bundle";
}

async function dispatchAgentContextOperation(
  service: MemoryService,
  invocation: AuthorizedInvocation
): Promise<RpcResponse> {
  const input = invocation.input as {
    projectId: string;
    sessionId?: string;
    taskText?: string;
    requestedBy?: string;
  };
  try {
    const result = invocation.name === "memory.get_context_bundle"
      ? await service.getAgentContextBundle(input)
      : await service.previewAgentContextBundle(input);
    return rpcOk(invocation.requestId, result);
  } catch {
    return rpcError(invocation.requestId, createPublicError("internal"));
  }
}

function normalizeAgentProjectionData(
  operation: string,
  value: unknown,
  projectId: string | undefined
): unknown {
  if (operation !== "memory.get_startup_state" || !value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const startup = value as Record<string, unknown>;
  if (startup.notModified === true) {
    return {
      schema: "zharwing.memory.startup.v2",
      notModified: true,
      ...(typeof startup.revision === "string" ? { revision: startup.revision } : {}),
      ...(projectId ? { projectId } : {})
    };
  }
  const activeSession = objectValue(startup.activeSession);
  const latestSession = objectValue(startup.latestSession);
  const recentSessions = arrayValue(startup.recentSessions);
  const workstreams = arrayValue(startup.workstreams);
  return {
    schema: "zharwing.memory.startup.v2",
    projectStatus: "resolved",
    ...(typeof startup.revision === "string" ? { revision: startup.revision } : {}),
    ...(projectId ? { projectId } : {}),
    ...(activeSession ? { activeSession } : {}),
    ...(latestSession ? { latestSession } : {}),
    recentSessions,
    workstreams,
    counts: {
      recentSessionsReturned: recentSessions.length,
      workstreamsReturned: workstreams.length
    },
    recommendedAction: activeSession ? "resume-active" : latestSession ? "resume-latest" : "start-new",
    contextReadiness: activeSession || latestSession ? "ready" : "needs-session",
    safetyStatus: startup.safetyStatus === "blocked" ? "blocked" : "needs-review",
    messageForClient: "Project-bound memory state is available through the filtered agent view."
  };
}

function prepareAgentProjectionInput(operation: string, value: unknown): unknown {
  if (operation === "memory.get_latest_session" && value === undefined) return null;
  if (
    operation !== "memory.get_session_detail" ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) return value;
  const detail = value as Record<string, unknown>;
  const session = objectValue(detail.session);
  return {
    ...detail,
    // The detail is one disclosure unit. Keeping the property present even
    // when classification is missing makes the hardened projector deny the
    // entire body rather than merely dropping the nested summary.
    visibility: session?.visibility
  };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function resultSessionId(result: unknown): string | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const id = (result as Record<string, unknown>).id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}
