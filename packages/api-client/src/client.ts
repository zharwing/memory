import {
  ContractDecodeError,
  RPC_COMPATIBILITY_VERSION,
  createPublicError,
  getOperationDefinition,
  isOperationName,
  isAgentOperationName,
  isPlainObject,
  parseAgentOperationResult,
  parseOperationInput,
  parseOperationOutput,
  publicErrorSchema,
  type AgentResult,
  type OperationInput,
  type OperationName,
  type OperationOutput,
  type PrincipalAudience,
  type PublicError
} from "@zharwing/memory-core";
import {
  ResponseLimitError,
  TransportAccessError,
  type MemoryTransport,
  type TransportResponse
} from "./transport.js";

export interface ClientRuntime {
  createId(): string;
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export interface OperationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  correlationId?: string;
  idempotencyKey?: string;
  expectedRevision?: number;
}

export type OperationArguments<Name extends OperationName> = keyof OperationInput<Name> extends never
  ? [input?: OperationInput<Name>, options?: OperationOptions]
  : [input: OperationInput<Name>, options?: OperationOptions];

export interface MemoryClient {
  operation<Name extends OperationName>(
    name: Name,
    ...args: OperationArguments<Name>
  ): Promise<OperationOutput<Name>>;
}

export class OperationError extends Error {
  constructor(
    public readonly operation: string,
    public readonly correlationId: string,
    public readonly publicError: PublicError
  ) {
    super(publicMessage(publicError.messageId));
    this.name = "OperationError";
  }

  get code() {
    return this.publicError.code;
  }
}

export class OperationClient implements MemoryClient {
  constructor(
    protected readonly transport: MemoryTransport,
    protected readonly runtime: ClientRuntime = defaultClientRuntime,
    protected readonly audience: PrincipalAudience = "admin"
  ) {}

  operation<Name extends OperationName>(
    name: Name,
    ...args: OperationArguments<Name>
  ): Promise<OperationOutput<Name>>;
  async operation(
    name: OperationName,
    input: Record<string, unknown> = {},
    options: OperationOptions = {}
  ): Promise<unknown> {
    const definition = getOperationDefinition(name);
    const correlationId = options.correlationId ?? this.runtime.createId();
    let parsedInput: Record<string, unknown>;
    try {
      parsedInput = parseOperationInput(name, input) as Record<string, unknown>;
    } catch {
      throw this.error(name, correlationId, "validation");
    }
    if (definition.idempotency === "required" && !options.idempotencyKey) {
      throw this.error(name, correlationId, "validation");
    }

    const timeoutMs = options.timeoutMs ?? definition.timeoutMs;
    const linked = linkedAbort(options.signal, timeoutMs, this.runtime);
    let response: TransportResponse;
    try {
      response = await this.transport.send({
        audience: this.audience,
        version: RPC_COMPATIBILITY_VERSION,
        operation: name,
        input: parsedInput,
        context: {
          signal: linked.signal,
          timeoutMs,
          idempotencyKey: options.idempotencyKey,
          expectedRevision: options.expectedRevision,
          correlationId,
          maximumResponseBytes: definition.maximumResponseBytes
        }
      });
    } catch (error) {
      const code = options.signal?.aborted
        ? "cancelled"
        : linked.timedOut()
          ? definition.effect === "read" ? "timeout" : "outcome_unknown"
          : error instanceof TransportAccessError
            ? error.code
          : error instanceof ResponseLimitError
            ? "protocol"
            : definition.effect === "read" ? "unavailable" : "outcome_unknown";
      throw this.error(name, correlationId, code);
    } finally {
      linked.dispose();
    }

    this.assertAuthorizedStatus(name, correlationId, response);
    const envelope = this.decodeEnvelope(name, correlationId, response);
    if (!envelope.ok) throw new OperationError(name, correlationId, envelope.error);
    try {
      return parseOperationOutput(name, envelope.result);
    } catch {
      throw this.error(name, correlationId, "protocol");
    }
  }

  protected async rawAgentOperation(
    method: string,
    input: Record<string, unknown>,
    options: OperationOptions = {}
  ): Promise<AgentResult> {
    if (!isOperationName(method)) {
      throw this.error(method, options.correlationId ?? this.runtime.createId(), "compatibility");
    }
    const definition = getOperationDefinition(method);
    if (!isAgentOperationName(method)) {
      throw this.error(method, options.correlationId ?? this.runtime.createId(), "forbidden");
    }
    const correlationId = options.correlationId ?? this.runtime.createId();
    if (definition.idempotency === "required" && !options.idempotencyKey) {
      throw this.error(method, correlationId, "validation");
    }
    const timeoutMs = options.timeoutMs ?? definition.timeoutMs;
    const linked = linkedAbort(options.signal, timeoutMs, this.runtime);
    try {
      const response = await this.transport.send({
        audience: "agent",
        version: RPC_COMPATIBILITY_VERSION,
        operation: method,
        input,
        context: {
          signal: linked.signal,
          timeoutMs,
          idempotencyKey: options.idempotencyKey,
          expectedRevision: options.expectedRevision,
          correlationId,
          maximumResponseBytes: definition.maximumResponseBytes
        }
      });
      this.assertAuthorizedStatus(method, correlationId, response);
      const envelope = this.decodeEnvelope(method, correlationId, response);
      if (!envelope.ok) throw new OperationError(method, correlationId, envelope.error);
      return parseAgentOperationResult(method, envelope.result);
    } catch (error) {
      if (error instanceof OperationError) throw error;
      const code = options.signal?.aborted
        ? "cancelled"
        : linked.timedOut()
          ? definition.effect === "read" ? "timeout" : "outcome_unknown"
          : error instanceof TransportAccessError
            ? error.code
            : error instanceof ResponseLimitError || error instanceof ContractDecodeError
              ? "protocol"
              : definition.effect === "read" ? "unavailable" : "outcome_unknown";
      throw this.error(method, correlationId, code);
    } finally {
      linked.dispose();
    }
  }

  private decodeEnvelope(
    operation: string,
    correlationId: string,
    response: TransportResponse
  ): DecodedEnvelope {
    if (!response.contentType.toLowerCase().includes("application/json")) {
      throw this.error(operation, correlationId, "protocol");
    }
    if (!response.bodyText) throw this.error(operation, correlationId, "protocol");
    let value: unknown;
    try {
      value = JSON.parse(response.bodyText);
    } catch {
      throw this.error(operation, correlationId, "protocol");
    }
    if (!isPlainObject(value)) throw this.error(operation, correlationId, "protocol");
    if (value.version !== RPC_COMPATIBILITY_VERSION) {
      throw this.error(operation, correlationId, "compatibility");
    }
    if (value.id !== correlationId) throw this.error(operation, correlationId, "protocol");
    if (typeof value.ok !== "boolean") throw this.error(operation, correlationId, "protocol");
    if (value.ok) {
      if (response.status < 200 || response.status >= 300) throw this.error(operation, correlationId, "protocol");
      return { ok: true, result: value.result };
    }
    if (!isPlainObject(value.error)) throw this.error(operation, correlationId, "protocol");
    let publicError: PublicError;
    try {
      // Parse the complete value. The closed schema rejects legacy message,
      // stack, cause, path, payload, and any other unregistered property.
      publicError = publicErrorSchema.parse(value.error, `${operation}.error`);
    } catch {
      throw this.error(operation, correlationId, "protocol");
    }
    return { ok: false, error: publicError };
  }

  private assertAuthorizedStatus(
    operation: string,
    correlationId: string,
    response: TransportResponse
  ): void {
    if (response.status === 401) throw this.error(operation, correlationId, "unauthorized");
    if (response.status === 403) throw this.error(operation, correlationId, "forbidden");
  }

  private error(operation: string, correlationId: string, code: PublicError["code"]): OperationError {
    return new OperationError(operation, correlationId, createPublicError(code, { debugId: correlationId }));
  }
}

type DecodedEnvelope = { ok: true; result: unknown } | { ok: false; error: PublicError };

const defaultClientRuntime: ClientRuntime = {
  createId() {
    return globalThis.crypto?.randomUUID?.() ?? `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  },
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle);
  }
};

function linkedAbort(parent: AbortSignal | undefined, timeoutMs: number, runtime: ClientRuntime) {
  const controller = new AbortController();
  let timeoutElapsed = false;
  const abortFromParent = () => controller.abort();
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = runtime.setTimeout(() => {
    timeoutElapsed = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timeoutElapsed,
    dispose() {
      runtime.clearTimeout(timeout);
      parent?.removeEventListener("abort", abortFromParent);
    }
  };
}

function publicMessage(messageId: PublicError["messageId"]): string {
  switch (messageId) {
    case "operation.validation": return "The request is not valid.";
    case "operation.unauthorized": return "Unlock this session to continue.";
    case "operation.forbidden": return "This action is not allowed.";
    case "operation.not_found": return "The requested item was not found.";
    case "operation.conflict": return "The item changed before this action completed.";
    case "operation.unavailable": return "The memory service is unavailable.";
    case "operation.timeout": return "The memory service did not respond in time.";
    case "operation.cancelled": return "The operation was cancelled.";
    case "operation.protocol": return "The memory service returned an invalid response.";
    case "operation.compatibility": return "The memory service is not compatible with this app version.";
    case "operation.outcome_unknown": return "The operation may have been applied; reconcile before trying again.";
    case "operation.internal": return "The operation could not be completed.";
  }
}

export function isContractDecodeError(error: unknown): error is ContractDecodeError {
  return error instanceof ContractDecodeError;
}
