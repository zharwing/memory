import crypto from "node:crypto";
import {
  ContractDecodeError,
  RPC_COMPATIBILITY_VERSION,
  createPublicError,
  extractOperationProjectId,
  getOperationAdmissionMetadata,
  getOperationDefinition,
  getOperationProjectScope,
  isLoopbackHost,
  isOperationName,
  parseOperationInput,
  principalAllowsOperation,
  principalAllowsProject,
  type AuthenticatedPrincipal,
  type OperationInput,
  type OperationName,
  type PublicError,
  type RpcRequest,
  type RpcResponse
} from "@zharwing/memory-core";
import type { AuthorityClock } from "./authority-service.js";
import { AuthorityService } from "./authority-service.js";
import { OperationEffectJournal } from "./effect-journal.js";
import type { DurableDomainEffect } from "@zharwing/memory-store";

export type AdmissionEndpoint = "/rpc" | "/agent-rpc" | "/mcp";

export interface OperationAdmissionContext {
  readonly endpoint: AdmissionEndpoint;
  readonly httpMethod: string;
  readonly host: string;
  readonly origin?: string;
  readonly principal: AuthenticatedPrincipal<OperationName>;
  readonly csrfValidated: boolean;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
  /** Trusted daemon-resolved generation for the exact requested project. */
  readonly projectGeneration?: string;
}

export interface AuthorizedInvocation<Name extends OperationName = OperationName> {
  readonly requestId?: string | number;
  readonly name: Name;
  readonly input: OperationInput<Name>;
  readonly principal: AuthenticatedPrincipal<OperationName>;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
  readonly projectId?: string;
  /** Registrar-private claim identifier used to settle an apply/reconcile effect. */
  readonly admissionClaimId?: string;
  /** Registrar-minted opaque domain marker; never decoded from caller input. */
  readonly domainEffect?: DurableDomainEffect;
}

export type AdmissionResult =
  | { readonly ok: true; readonly invocation: AuthorizedInvocation }
  | { readonly ok: false; readonly status: number; readonly error: PublicError };

export interface OperationRegistrarOptions {
  readonly effectJournal: OperationEffectJournal;
  readonly createClaimId?: () => string;
}

/**
 * The only hardened HTTP admission path for domain operations. It authorizes
 * immutable credential claims, validates registry input once, binds the
 * project exactly, and claims consequential effects before dispatch.
 */
export class OperationRegistrar {
  private readonly effectJournal: OperationEffectJournal;
  private readonly createClaimId: () => string;

  constructor(
    private readonly authority: AuthorityService,
    _clock: AuthorityClock,
    options: OperationRegistrarOptions
  ) {
    this.effectJournal = options.effectJournal;
    this.createClaimId = options.createClaimId ?? (() => crypto.randomUUID());
  }

  authorize(context: OperationAdmissionContext, request: RpcRequest): AdmissionResult {
    if (context.httpMethod !== "POST" || !isLoopbackHostHeader(context.host)) {
      return refuse(403, "forbidden");
    }
    if (!originMatchesPrincipal(context)) return refuse(403, "forbidden");
    if (!this.authority.isCurrent(context.principal)) return refuse(401, "unauthorized");
    if (!endpointAcceptsPrincipal(context.endpoint, context.principal.audience)) {
      return refuse(403, "forbidden");
    }
    if (
      !request ||
      typeof request.method !== "string" ||
      request.version !== RPC_COMPATIBILITY_VERSION ||
      !isOperationName(request.method)
    ) {
      return refuse(400, "compatibility");
    }

    const name = request.method;
    const metadata = getOperationAdmissionMetadata(name);
    if (
      !metadata.audiences.includes(context.principal.audience) ||
      !principalAllowsOperation(context.principal, name)
    ) {
      return refuse(403, "forbidden");
    }
    if (context.principal.audience === "browser" && !context.csrfValidated) {
      return refuse(403, "forbidden");
    }

    const projectScope = getOperationProjectScope(name, context.principal.audience);
    const requestedProjectId = extractOperationProjectId(name, request.params ?? {});
    if (!principalAllowsProject(context.principal, requestedProjectId, projectScope)) {
      return refuse(403, "forbidden");
    }

    let input: OperationInput<typeof name>;
    try {
      input = parseOperationInput(name, request.params ?? {});
    } catch (error) {
      return refuse(error instanceof ContractDecodeError ? 400 : 500, error instanceof ContractDecodeError ? "validation" : "internal");
    }
    const projectId = extractOperationProjectId(name, input);
    if (projectId !== requestedProjectId) {
      return refuse(400, "validation");
    }

    const definition = getOperationDefinition(name);
    const consequential = definition.effect !== "read";
    const inputKey = normalizedIdempotencyKey(inputIdempotencyKey(input));
    const headerKey = normalizedIdempotencyKey(context.idempotencyKey);
    if (context.idempotencyKey && !headerKey) return refuse(400, "validation");
    if (inputIdempotencyKey(input) && !inputKey) return refuse(400, "validation");
    if (headerKey && inputKey && headerKey !== inputKey) return refuse(409, "conflict");
    const idempotencyKey = headerKey ?? inputKey;
    if (definition.idempotency === "required" && !idempotencyKey) {
      return refuse(400, "validation");
    }

    const baseInvocation = {
      requestId: request.id,
      name,
      input,
      principal: context.principal,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(normalizedCorrelationId(context.correlationId) ? {
        correlationId: normalizedCorrelationId(context.correlationId)
      } : {}),
      ...(projectId ? { projectId } : {})
    } satisfies Omit<AuthorizedInvocation<typeof name>, "admissionClaimId">;

    if (!consequential || !idempotencyKey) {
      return { ok: true, invocation: baseInvocation };
    }

    const requestDigest = stableRequestDigest(name, projectId, input);
    const claimId = this.createClaimId();
    if (!claimId) return refuse(503, "unavailable");
    const decision = this.effectJournal.claim({
      sessionOwner: context.principal.sessionOwner,
      projectId: projectId ?? null,
      projectGeneration: projectId ? context.projectGeneration ?? null : null,
      operation: name,
      idempotencyKey,
      inputDigest: requestDigest
    }, claimId);
    if (decision.kind === "conflict") return refuse(409, "conflict");
    if (decision.kind === "outcome-unknown") return refuse(409, "outcome_unknown");
    if (decision.kind === "unavailable") return refuse(503, "unavailable");
    if (decision.kind === "reconcile") {
      return {
        ok: true,
        invocation: {
          ...baseInvocation,
          admissionClaimId: decision.claimId,
          domainEffect: decision.effect
        }
      };
    }
    return {
      ok: true,
      invocation: {
        ...baseInvocation,
        admissionClaimId: claimId,
        ...(decision.effect ? { domainEffect: decision.effect } : {})
      }
    };
  }

  complete(invocation: AuthorizedInvocation, response: RpcResponse): void {
    if (!invocation.admissionClaimId) return;
    // Persist only a completion receipt. No response bytes are durable, so a
    // retry after policy/credential changes must reconcile under current
    // policy and can never replay a stale privacy projection.
    if (response.ok) {
      this.effectJournal.complete(invocation.admissionClaimId);
      return;
    }
    // Once dispatch began, any failure can race a durable domain commit or a
    // concurrent same-identity reconciler. Retain the claim; the next request
    // must reconcile the atomic domain marker with the same caller key.
  }

  abandon(invocation: AuthorizedInvocation): void {
    if (!invocation.admissionClaimId) return;
    if (invocation.domainEffect?.mode === "reconcile") return;
    this.effectJournal.release(invocation.admissionClaimId);
  }
}

function endpointAcceptsPrincipal(
  endpoint: AdmissionEndpoint,
  audience: AuthenticatedPrincipal<OperationName>["audience"]
): boolean {
  if (endpoint === "/agent-rpc" || endpoint === "/mcp") return audience === "agent";
  return audience !== "agent";
}

function originMatchesPrincipal(context: OperationAdmissionContext): boolean {
  if (context.principal.audience === "browser") {
    return Boolean(context.origin && isLocalOrigin(context.origin));
  }
  // A browser Origin must never be able to exercise an admin, provider,
  // backup, desktop, or agent bearer even when that bearer is valid.
  return context.origin === undefined;
}

function isLocalOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}

function isLoopbackHostHeader(host: string): boolean {
  try {
    return isLoopbackHost(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function inputIdempotencyKey(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = (input as Record<string, unknown>).idempotencyKey;
  return typeof value === "string" ? value : undefined;
}

function normalizedIdempotencyKey(value: string | undefined): string | undefined {
  if (!value || value.length < 8 || value.length > 256 || !/^[A-Za-z0-9:._-]+$/.test(value)) {
    return undefined;
  }
  return value;
}

function normalizedCorrelationId(value: string | undefined): string | undefined {
  if (!value || value.length > 256 || !/^[A-Za-z0-9:._-]+$/.test(value)) return undefined;
  return value;
}

function stableRequestDigest(name: OperationName, projectId: string | undefined, input: unknown): string {
  return crypto.createHash("sha256")
    .update(canonicalJson({
      name,
      projectId: projectId ?? null,
      // The caller key is already a separate effect-identity dimension. Its
      // transport location (HTTP header versus decoded stdio/CLI field) must
      // not turn the same logical input into a different digest.
      input: inputWithoutIdempotencyKey(input)
    }), "utf8")
    .digest("hex");
}

function inputWithoutIdempotencyKey(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const { idempotencyKey: _idempotencyKey, ...domainInput } = input as Record<string, unknown>;
  return domainInput;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite operation input.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
  }
  if (value === undefined) return "null";
  throw new Error("Unsupported operation input.");
}

function refuse(status: number, code: PublicError["code"]): AdmissionResult {
  return { ok: false, status, error: createPublicError(code) };
}
