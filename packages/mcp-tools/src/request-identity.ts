import crypto from "node:crypto";
import type { OperationName } from "@zharwing/memory-core";

export type JsonRpcRequestId = string | number;

const MAX_REQUEST_ID_CHARACTERS = 1_024;

/**
 * JSON-RPC identity is type-sensitive. In particular, the string "1" and
 * number 1 are distinct calls and must never share an effect identity.
 */
export function parseJsonRpcRequestId(value: unknown, path = "request.id"): JsonRpcRequestId {
  if (typeof value === "string") {
    if (value.length > MAX_REQUEST_ID_CHARACTERS) {
      throw new McpProtocolError("invalid-request", `${path} exceeds the supported length.`);
    }
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return Object.is(value, -0) ? 0 : value;
  }
  throw new McpProtocolError("invalid-request", `${path} must be a string or safe integer.`);
}

export function jsonRpcRequestIdentityKey(requestId: JsonRpcRequestId): string {
  return `${typeof requestId === "string" ? "string" : "number"}:${String(requestId)}`;
}

/**
 * Required mutations share this exact caller identity across HTTP MCP, stdio
 * MCP, and CLI adapters. The raw request id is never placed in a header,
 * journal, log, diagnostic, or operation result.
 */
export function deriveMcpMutationIdempotencyKey(
  requestId: JsonRpcRequestId,
  operation: OperationName
): string {
  const digest = identityDigest("zharwing.mcp-idempotency.v1", requestId, operation);
  return `mcp:v1:${digest}`;
}

/** Stable bounded RPC correlation for the agent-rpc hop; not an effect key. */
export function deriveMcpCorrelationId(
  requestId: JsonRpcRequestId,
  operation: OperationName
): string {
  const digest = identityDigest("zharwing.mcp-correlation.v1", requestId, operation);
  return `mcp-call:v1:${digest}`;
}

function identityDigest(
  domain: string,
  requestId: JsonRpcRequestId,
  operation: OperationName
): string {
  const identityType = typeof requestId === "string" ? "string" : "number";
  return crypto.createHash("sha256")
    .update(`${domain}\u0000`, "utf8")
    .update(operation, "utf8")
    .update("\u0000", "utf8")
    .update(identityType, "utf8")
    .update("\u0000", "utf8")
    .update(String(requestId), "utf8")
    .digest("hex");
}

export type McpProtocolErrorKind =
  | "parse-error"
  | "invalid-request"
  | "method-not-found"
  | "invalid-params"
  | "internal";

/** Carries only fixed public protocol classification; never an upstream error. */
export class McpProtocolError extends Error {
  constructor(
    public readonly kind: McpProtocolErrorKind,
    message: string
  ) {
    super(message);
    this.name = "McpProtocolError";
  }
}
