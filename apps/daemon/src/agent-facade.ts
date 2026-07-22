import type { ContextBundle, ContextIncludedItem, SearchResult } from "@zharwing/memory-core";
import { MEMORY_TOOLS } from "@zharwing/memory-mcp";
import { applyPrivacyGate } from "@zharwing/memory-privacy";
import type { MemoryService } from "./memory-service.js";
import { dispatchRpc, type RpcRequest, type RpcResponse } from "./rpc.js";

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
  excludedCount: number;
  redactionsCount: number;
  safetyStatus: ContextBundle["safetyStatus"];
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

export async function dispatchAgentRpc(service: MemoryService, request: RpcRequest): Promise<RpcResponse> {
  if (!isAgentSafeMethod(request.method)) {
    return {
      id: request.id,
      ok: false,
      error: {
        message: `CONTROL_PLANE_ONLY: ${sanitizeMethodName(request.method)} is not available through MCP. Supported methods: ${agentSafeMethods().join(", ")}`
      }
    };
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
    return {
      id: request.id,
      ok: false,
      error: { message: sanitizeAgentError(error) }
    };
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
    excludedCount: bundle.excludedItems.length,
    redactionsCount: bundle.redactions.length,
    safetyStatus: bundle.safetyStatus
  };
}

function sanitizeRpcResponse(response: RpcResponse): RpcResponse {
  if (response.ok) return response;
  return {
    id: response.id,
    ok: false,
    error: { message: sanitizeAgentError(new Error(response.error?.message || "request failed")) }
  };
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

function sanitizeMethodName(method: string): string {
  return String(method).slice(0, 80).replace(/[^\w.-]/g, "_");
}

function sanitizeAgentError(error: unknown): string {
  if (error instanceof AgentInputError) return `AGENT_INPUT_ERROR: ${error.message}`;
  return "AGENT_ERROR: the request failed; details are available in the daemon control-plane logs.";
}
