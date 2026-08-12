import crypto from "node:crypto";
import {
  extractOperationProjectId,
  getOperationDefinition,
  isOperationName,
  operationAcceptsAudience,
  parseOperationInput,
  principalAllowsOperation,
  principalAllowsProject,
  type AuthenticatedOperationPrincipal,
  type OperationName
} from "@zharwing/memory-core";

const INTENT_TTL_MS = 2 * 60 * 1000;
const MAX_INTENTS = 512;

interface StoredIntent {
  readonly intentId: string;
  readonly operation: OperationName;
  readonly input: Record<string, unknown>;
  readonly inputDigest: string;
  readonly projectId: string;
  readonly principalId: string;
  readonly sessionId: string;
  readonly audience: string;
  readonly authorityEpoch: number;
  readonly policyDigest: string;
  readonly rotationId: string;
  readonly revocationId: string;
  readonly acknowledgement: string;
  readonly expiresAtMs: number;
  state: "issued" | "executing" | "cancelled" | "committed" | "failed";
}

export interface DestructiveIntentPreview {
  readonly intentId: string;
  readonly operation: OperationName;
  readonly projectId: string;
  readonly targetDigest: string;
  readonly acknowledgement: string;
  readonly expiresAt: string;
}

/**
 * Server-owned confirmation capability. The browser receives only a short-lived
 * opaque id and exact acknowledgement copy; the decoded target stays in the
 * daemon and can execute at most once.
 */
export class DestructiveIntentService {
  private readonly intents = new Map<string, StoredIntent>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  prepare(
    request: { projectId: string; operation: string; input: Record<string, unknown> },
    principal: AuthenticatedOperationPrincipal
  ): DestructiveIntentPreview {
    this.compact();
    if (this.intents.size >= MAX_INTENTS) throw new Error("Confirmation intent capacity is unavailable.");
    if (!isOperationName(request.operation)) throw new Error("Unknown destructive operation.");
    const definition = getOperationDefinition(request.operation);
    if (definition.effect !== "destructive") throw new Error("Operation is not destructive.");
    if (!operationAcceptsAudience(request.operation, principal.audience)) throw new Error("Operation audience refused.");
    if (!principalAllowsOperation(principal, request.operation)) throw new Error("Operation authority refused.");
    const decoded = parseOperationInput(request.operation, request.input) as Record<string, unknown>;
    const projectId = extractOperationProjectId(request.operation, decoded);
    if (!projectId || projectId !== request.projectId || !principalAllowsProject(principal, projectId, "required")) {
      throw new Error("Destructive target project refused.");
    }
    const inputDigest = digest(decoded);
    const intentId = crypto.randomBytes(32).toString("hex");
    const acknowledgement = `Confirm ${request.operation} for target ${inputDigest.slice(0, 12)}`;
    const expiresAtMs = this.now() + INTENT_TTL_MS;
    this.intents.set(intentId, {
      intentId,
      operation: request.operation,
      input: decoded,
      inputDigest,
      projectId,
      principalId: principal.principalId,
      sessionId: principal.sessionId,
      audience: principal.audience,
      authorityEpoch: principal.authorityEpoch,
      policyDigest: principal.policyDigest,
      rotationId: principal.rotationId,
      revocationId: principal.revocationId,
      acknowledgement,
      expiresAtMs,
      state: "issued"
    });
    return {
      intentId,
      operation: request.operation,
      projectId,
      targetDigest: inputDigest,
      acknowledgement,
      expiresAt: new Date(expiresAtMs).toISOString()
    };
  }

  async commit(
    request: { projectId: string; intentId: string; acknowledgement: string },
    principal: AuthenticatedOperationPrincipal,
    execute: (operation: OperationName, input: Record<string, unknown>) => Promise<unknown>
  ): Promise<Record<string, unknown>> {
    const intent = this.requireCurrent(request.projectId, request.intentId, principal);
    if (request.acknowledgement !== intent.acknowledgement) throw new Error("Confirmation acknowledgement mismatch.");
    if (intent.state !== "issued") throw new Error("Confirmation intent has already been consumed.");
    intent.state = "executing";
    try {
      const result = await execute(intent.operation, intent.input);
      intent.state = "committed";
      return { intentId: intent.intentId, status: "committed", operation: intent.operation, result };
    } catch (error) {
      intent.state = "failed";
      throw error;
    }
  }

  cancel(
    request: { projectId: string; intentId: string },
    principal: AuthenticatedOperationPrincipal
  ): Record<string, unknown> {
    const intent = this.requireCurrent(request.projectId, request.intentId, principal);
    if (intent.state !== "issued") throw new Error("Confirmation intent has already been consumed.");
    intent.state = "cancelled";
    return { intentId: intent.intentId, status: "cancelled", operation: intent.operation };
  }

  private requireCurrent(
    projectId: string,
    intentId: string,
    principal: AuthenticatedOperationPrincipal
  ): StoredIntent {
    const intent = this.intents.get(intentId);
    if (!intent || !/^[a-f0-9]{64}$/.test(intentId)) throw new Error("Confirmation intent not found.");
    if (this.now() > intent.expiresAtMs) {
      intent.state = "cancelled";
      throw new Error("Confirmation intent expired.");
    }
    if (
      intent.projectId !== projectId ||
      intent.principalId !== principal.principalId ||
      intent.sessionId !== principal.sessionId ||
      intent.audience !== principal.audience ||
      intent.authorityEpoch !== principal.authorityEpoch ||
      intent.policyDigest !== principal.policyDigest ||
      intent.rotationId !== principal.rotationId ||
      intent.revocationId !== principal.revocationId ||
      !principalAllowsProject(principal, projectId, "required")
    ) throw new Error("Confirmation authority changed.");
    return intent;
  }

  private compact(): void {
    const now = this.now();
    for (const [id, intent] of this.intents) {
      if (now > intent.expiresAtMs + INTENT_TTL_MS) this.intents.delete(id);
    }
  }
}

function digest(value: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}
