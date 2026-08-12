import {
  RPC_COMPATIBILITY_VERSION,
  createPublicError,
  extractOperationProjectId,
  isOperationName,
  operationAcceptsAudience,
  parseOperationInput,
  parseOperationOutput,
  type OperationName,
  type PublicErrorCode
} from "@zharwing/memory-core";
import {
  TransportAccessError,
  utf8ByteLength,
  type MemoryTransport,
  type TransportRequest,
  type TransportResponse
} from "@zharwing/memory-api-client";

export type FakeTransportStep =
  | { readonly kind: "success"; readonly result: unknown; readonly status?: number }
  | { readonly kind: "public-error"; readonly code: PublicErrorCode; readonly status?: number }
  | { readonly kind: "malformed"; readonly bodyText: string; readonly contentType?: string; readonly status?: number }
  | { readonly kind: "transport-error" }
  | { readonly kind: "pending" };

export interface FakeTransportPlan {
  readonly projectId?: string;
  readonly responses: Readonly<Partial<Record<OperationName, readonly FakeTransportStep[]>>>;
}

export interface RecordedFakeRequest {
  readonly operation: string;
  readonly audience: string;
  readonly projectId?: string;
  readonly correlationId: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/**
 * In-memory carrier used only by the frontend scenario harness.
 *
 * Successful fixtures are parsed once when registered and again by the real
 * OperationClient when invoked. The carrier implements the production wire
 * envelope, correlation, audience and project-scope rules; it never calls
 * fetch, Tauri, a daemon, browser storage, or a filesystem.
 */
export class FakeMemoryTransport implements MemoryTransport {
  readonly requests: RecordedFakeRequest[] = [];
  readonly #plan: FakeTransportPlan;
  readonly #cursors = new Map<OperationName, number>();

  constructor(plan: FakeTransportPlan) {
    this.#plan = validatePlan(plan);
  }

  async send(request: TransportRequest): Promise<TransportResponse> {
    if (request.version !== RPC_COMPATIBILITY_VERSION || !isOperationName(request.operation)) {
      return envelope(request, 400, false, undefined, createPublicError("compatibility"));
    }
    const operation = request.operation;
    if (!operationAcceptsAudience(operation, request.audience)) {
      throw new TransportAccessError("forbidden", 403);
    }

    const input = parseOperationInput(operation, request.input) as Record<string, unknown>;
    const projectId = extractOperationProjectId(operation, input);
    if (this.#plan.projectId && projectId && projectId !== this.#plan.projectId) {
      throw new TransportAccessError("forbidden", 403);
    }
    this.requests.push(Object.freeze({
      operation,
      audience: request.audience,
      projectId,
      correlationId: request.context.correlationId,
      input: Object.freeze({ ...input })
    }));

    const steps = this.#plan.responses[operation];
    if (!steps?.length) {
      throw new Error(`No synthetic response is registered for ${operation}.`);
    }
    const cursor = this.#cursors.get(operation) ?? 0;
    const step = steps[Math.min(cursor, steps.length - 1)];
    this.#cursors.set(operation, cursor + 1);

    switch (step.kind) {
      case "success":
        return envelope(request, step.status ?? 200, true, step.result);
      case "public-error":
        return envelope(
          request,
          step.status ?? statusForPublicError(step.code),
          false,
          undefined,
          createPublicError(step.code, { debugId: request.context.correlationId })
        );
      case "malformed":
        return response(step.status ?? 200, step.contentType ?? "application/json", step.bodyText);
      case "transport-error":
        throw new Error("Synthetic carrier failure.");
      case "pending":
        return waitForAbort(request.context.signal);
    }
  }
}

export const fakeSuccess = (result: unknown): FakeTransportStep => ({ kind: "success", result });
export const fakePublicError = (code: PublicErrorCode): FakeTransportStep => ({ kind: "public-error", code });
export const fakeMalformed = (bodyText: string, contentType = "application/json"): FakeTransportStep => ({
  kind: "malformed",
  bodyText,
  contentType
});
export const fakeTransportError = (): FakeTransportStep => ({ kind: "transport-error" });
export const fakePending = (): FakeTransportStep => ({ kind: "pending" });

function validatePlan(plan: FakeTransportPlan): FakeTransportPlan {
  const validated: Partial<Record<OperationName, readonly FakeTransportStep[]>> = {};
  for (const [rawName, rawSteps] of Object.entries(plan.responses)) {
    if (!isOperationName(rawName)) throw new Error(`Unknown synthetic operation: ${rawName}`);
    if (!rawSteps?.length) throw new Error(`Synthetic operation ${rawName} has no response steps.`);
    validated[rawName] = Object.freeze(rawSteps.map((step) => {
      if (step.kind !== "success") return Object.freeze({ ...step });
      // Registration-time parsing prevents a fixture from drifting around the
      // production output schema. OperationClient parses the wire result again.
      return Object.freeze({ ...step, result: parseOperationOutput(rawName, step.result) });
    }));
  }
  return Object.freeze({
    projectId: plan.projectId,
    responses: Object.freeze(validated)
  });
}

function envelope(
  request: TransportRequest,
  status: number,
  ok: boolean,
  result?: unknown,
  error?: unknown
): TransportResponse {
  return response(status, "application/json", JSON.stringify({
    version: RPC_COMPATIBILITY_VERSION,
    id: request.context.correlationId,
    ok,
    ...(ok ? { result } : { error })
  }));
}

function response(status: number, contentType: string, bodyText: string): TransportResponse {
  return { status, contentType, bodyText, byteLength: utf8ByteLength(bodyText) };
}

function statusForPublicError(code: PublicErrorCode): number {
  if (code === "unauthorized") return 401;
  if (code === "forbidden") return 403;
  if (code === "not_found") return 404;
  if (code === "conflict") return 409;
  if (code === "validation") return 422;
  return 500;
}

function waitForAbort(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    const abort = () => reject(new DOMException("Synthetic request aborted.", "AbortError"));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}
