import type { MemoryTransport, TransportRequest, TransportResponse } from "./transport.js";
import { ResponseLimitError, utf8ByteLength } from "./transport.js";

export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface TauriMemoryTransportOptions {
  invoke: TauriInvoke;
  command?: string;
}

/**
 * Carrier-only Tauri adapter. F04 owns registering the Rust command and its
 * capability policy; this adapter remains constructible and testable without
 * importing browser globals or starting a daemon.
 */
export class TauriMemoryTransport implements MemoryTransport {
  constructor(private readonly options: TauriMemoryTransportOptions) {}

  async send(request: TransportRequest): Promise<TransportResponse> {
    if (request.audience !== "desktop") {
      throw new Error("The Tauri carrier does not expose the agent audience.");
    }
    const projectId = projectIdFromInput(request.input);
    const payload = await invokeUntilAborted(
      request.context.signal,
      () => this.options.invoke<unknown>(this.options.command ?? "memory_rpc", {
        request: JSON.stringify({
          version: request.version,
          id: request.context.correlationId,
          method: request.operation,
          params: request.input,
          idempotencyKey: request.context.idempotencyKey,
          expectedRevision: request.context.expectedRevision
        }),
        projectId
      })
    );
    const bodyText = typeof payload === "string" ? payload : JSON.stringify(payload);
    const byteLength = utf8ByteLength(bodyText);
    if (byteLength > request.context.maximumResponseBytes) {
      throw new ResponseLimitError(request.context.maximumResponseBytes);
    }
    return { status: 200, contentType: "application/json", bodyText, byteLength };
  }
}

function projectIdFromInput(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const projectId = (input as Record<string, unknown>).projectId;
  return typeof projectId === "string" && projectId.length > 0 ? projectId : null;
}

/**
 * Tauri's invoke API does not accept an AbortSignal. Race the bridge promise
 * against the client-owned linked signal so caller cancellation and operation
 * timeouts settle even when the Rust command never does.
 */
function invokeUntilAborted<T>(signal: AbortSignal | undefined, invoke: () => Promise<T>): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortReason(signal));

  let invocation: Promise<T>;
  try {
    invocation = invoke();
  } catch (error) {
    return Promise.reject(error);
  }
  if (!signal) return invocation;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (continuation: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      continuation();
    };
    const onAbort = () => finish(() => reject(abortReason(signal)));

    signal.addEventListener("abort", onAbort, { once: true });
    invocation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error))
    );
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("The Tauri operation was aborted.");
}
