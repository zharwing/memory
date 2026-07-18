import { createHash } from "node:crypto";
import type { ContextBundle, ContextIncludedItem } from "@aimem/core";
import type { MemoryService } from "./memory-service.js";
import type { RpcRequest, RpcResponse } from "./rpc.js";

export const AIMEM_BUNDLE_SCHEMA = "aimem.bundle.v1";
export const DEFAULT_BUNDLE_TOKEN_BUDGET = 4000;

/**
 * Agent-facing sections of a context bundle. Deliberately narrower than the
 * control-plane ContextBundle: no source paths, no excluded-item titles,
 * no audit log path, no redaction details — counts only.
 */
export interface AgentBundleSection {
  id: string;
  type: ContextIncludedItem["type"];
  title: string;
  mode: ContextIncludedItem["mode"];
  content: string;
  tokenEstimate: number;
}

export interface AgentBundle {
  schema: typeof AIMEM_BUNDLE_SCHEMA;
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

export interface AgentApprovalRequired {
  schema: typeof AIMEM_BUNDLE_SCHEMA;
  status: "approval_required";
  projectId: string;
  approvalRef: string;
  message: string;
}

type AgentHandler = (service: MemoryService, params: Record<string, unknown>) => Promise<unknown>;

/**
 * The complete agent-safe surface. Every method is opted in explicitly with
 * its own projected handler; anything absent here — existing, new, or
 * unknown — is control-plane-only and denied for agents by default.
 */
const AGENT_SAFE_HANDLERS: Record<string, AgentHandler> = {
  "memory.health": async () => ({ status: "ok" }),
  "memory.get_context_bundle": (service, params) => getAgentContextBundle(service, params)
};

export function agentSafeMethods(): string[] {
  return Object.keys(AGENT_SAFE_HANDLERS);
}

export function isAgentSafeMethod(method: string): boolean {
  return Object.prototype.hasOwnProperty.call(AGENT_SAFE_HANDLERS, method);
}

export async function dispatchAgentRpc(service: MemoryService, request: RpcRequest): Promise<RpcResponse> {
  const handler = AGENT_SAFE_HANDLERS[request.method];
  if (!handler) {
    return {
      id: request.id,
      ok: false,
      error: {
        message: `CONTROL_PLANE_ONLY: ${sanitizeMethodName(request.method)} is not available to agents. Agent-safe methods: ${agentSafeMethods().join(", ")}`
      }
    };
  }
  try {
    const result = await handler(service, request.params || {});
    return { id: request.id, ok: true, result };
  } catch (error) {
    // Agent-visible errors carry a stable code and message class only:
    // no stacks, no filesystem paths, no raw internals.
    return { id: request.id, ok: false, error: { message: sanitizeAgentError(error) } };
  }
}

async function getAgentContextBundle(
  service: MemoryService,
  params: Record<string, unknown>
): Promise<AgentBundle | AgentApprovalRequired> {
  const projectId = String(params.projectId || "");
  if (!projectId) throw new AgentInputError("projectId is required");
  const maxTokens = normalizeBudget(params.maxTokens);

  const project = await service.getProject(projectId);
  if (!project) throw new AgentInputError("unknown project");

  if (project.privacyPolicy?.requireApprovalBeforeServingContext) {
    return {
      schema: AIMEM_BUNDLE_SCHEMA,
      status: "approval_required",
      projectId,
      approvalRef: approvalRef(projectId, params),
      message: "The project requires operator approval before memory context is served to agents."
    };
  }

  // Preview (not get) keeps agent reads idempotent: no bundle artifact is
  // persisted per request.
  const bundle = await service.previewContextBundle({
    projectId,
    sessionId: params.sessionId ? String(params.sessionId) : undefined,
    taskText: params.taskText ? String(params.taskText) : undefined,
    requestedBy: "agent"
  });
  return projectBundleForAgent(bundle, {
    maxTokens,
    idempotencyKey: params.idempotencyKey ? String(params.idempotencyKey) : undefined
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
      mode: item.mode,
      content: item.content,
      tokenEstimate
    });
    usedTokens += tokenEstimate;
  }
  return {
    schema: AIMEM_BUNDLE_SCHEMA,
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

class AgentInputError extends Error {}

function normalizeBudget(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_BUNDLE_TOKEN_BUDGET;
  return Math.min(parsed, 32_000);
}

function approvalRef(projectId: string, params: Record<string, unknown>): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ projectId, sessionId: params.sessionId ?? null, taskText: params.taskText ?? null }))
    .digest("hex");
  return `aimem-approval-${digest.slice(0, 16)}`;
}

function sanitizeMethodName(method: string): string {
  return String(method).slice(0, 80).replace(/[^\w.-]/g, "_");
}

function sanitizeAgentError(error: unknown): string {
  if (error instanceof AgentInputError) return `AGENT_INPUT_ERROR: ${error.message}`;
  return "AGENT_ERROR: the request failed; details are available in the daemon control-plane logs.";
}
