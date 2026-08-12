import type {
  OperationName,
  PrincipalAudience,
  RPC_COMPATIBILITY_VERSION
} from "@zharwing/memory-core";

export interface OperationContext {
  signal?: AbortSignal;
  timeoutMs: number;
  idempotencyKey?: string;
  expectedRevision?: number;
  correlationId: string;
  maximumResponseBytes: number;
}

export interface TransportRequest {
  audience: PrincipalAudience;
  version: typeof RPC_COMPATIBILITY_VERSION;
  operation: OperationName | string;
  input: Record<string, unknown>;
  context: OperationContext;
}

export interface TransportResponse {
  status: number;
  contentType: string;
  bodyText: string;
  byteLength: number;
}

export interface MemoryTransport {
  send(request: TransportRequest): Promise<TransportResponse>;
}

/**
 * A transport can reject before a wire response exists (for example when a
 * browser session is already locked). Keep that rejection in the same typed
 * public-error vocabulary as a daemon 401/403 response.
 */
export class TransportAccessError extends Error {
  constructor(
    public readonly code: "unauthorized" | "forbidden",
    public readonly status: 401 | 403
  ) {
    super(code === "unauthorized" ? "The transport session is locked." : "The transport session is forbidden.");
    this.name = "TransportAccessError";
  }
}

export class ResponseLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`Response exceeded the ${limit}-byte contract limit.`);
    this.name = "ResponseLimitError";
  }
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
