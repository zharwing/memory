import { RPC_COMPATIBILITY_VERSION } from "@zharwing/memory-core";
import {
  ResponseLimitError,
  utf8ByteLength,
  type MemoryTransport,
  type TransportRequest,
  type TransportResponse
} from "./transport.js";
import { normalizeLocalDaemonBaseUrl } from "./local-url.js";

export interface NonBrowserCredentialTransportOptions {
  baseUrl: string;
  credential: string;
  fetch?: typeof fetch;
}

/**
 * Explicit compatibility adapter for trusted agent/admin runtimes. Its name
 * and constructor make it unsuitable for accidental browser composition.
 */
export class NonBrowserCredentialTransport implements MemoryTransport {
  private readonly requestFetch: typeof fetch;
  private readonly baseUrl: string;
  #credential: string;

  constructor(options: NonBrowserCredentialTransportOptions) {
    this.baseUrl = normalizeLocalDaemonBaseUrl(options.baseUrl);
    if (!options.credential) throw new Error("A non-browser credential is required.");
    this.#credential = options.credential;
    const requestFetch = options.fetch ?? globalThis.fetch;
    if (typeof requestFetch !== "function") throw new Error("A fetch implementation is required.");
    this.requestFetch = requestFetch;
  }

  async send(request: TransportRequest): Promise<TransportResponse> {
    if (request.audience !== "agent" && request.audience !== "admin") {
      throw new Error("The credential transport is restricted to agent and admin audiences.");
    }
    const endpoint = request.audience === "agent" ? "/agent-rpc" : "/rpc";
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${this.#credential}`,
      "content-type": "application/json",
      "x-correlation-id": request.context.correlationId,
      "x-rpc-compatibility-version": String(RPC_COMPATIBILITY_VERSION)
    };
    if (request.context.idempotencyKey) headers["x-idempotency-key"] = request.context.idempotencyKey;
    if (request.context.expectedRevision !== undefined) headers["if-match"] = String(request.context.expectedRevision);
    const response = await this.requestFetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        version: request.version,
        id: request.context.correlationId,
        method: request.operation,
        params: request.input
      }),
      signal: request.context.signal
    });
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > request.context.maximumResponseBytes) {
      throw new ResponseLimitError(request.context.maximumResponseBytes);
    }
    const bodyText = await response.text();
    const byteLength = utf8ByteLength(bodyText);
    if (byteLength > request.context.maximumResponseBytes) throw new ResponseLimitError(request.context.maximumResponseBytes);
    return { status: response.status, contentType: response.headers.get("content-type") ?? "", bodyText, byteLength };
  }
}
