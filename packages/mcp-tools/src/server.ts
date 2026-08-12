import { OperationError } from "@zharwing/memory-api-client";
import { dispatchMemoryTool, type McpDispatchContext, type McpToolCall } from "./dispatch.js";
import { MEMORY_PROMPTS } from "./prompts.js";
import {
  jsonRpcRequestIdentityKey,
  McpProtocolError,
  parseJsonRpcRequestId,
  type JsonRpcRequestId
} from "./request-identity.js";
import { MEMORY_TOOLS } from "./tools.js";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcRequestId;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcRequestId | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type McpToolDispatcher = (
  call: McpToolCall,
  context: McpDispatchContext
) => Promise<unknown>;

type TransportMode = "framed" | "line";

interface ParsedMessage {
  mode: TransportMode;
  payload: unknown;
}

const MAX_STDIO_MESSAGE_BYTES = 8 * 1024 * 1024;
const MAX_STDIO_HEADER_BYTES = 8 * 1024;

export async function handleMcpRequest(
  candidate: unknown,
  dispatchTool: McpToolDispatcher = dispatchMemoryTool
): Promise<JsonRpcResponse | undefined> {
  const request = parseJsonRpcRequest(candidate);

  if (request.method === "notifications/initialized") {
    if (request.id !== undefined) {
      throw new McpProtocolError("invalid-request", "Initialized must be a notification.");
    }
    return undefined;
  }

  if (request.id === undefined && request.method.startsWith("notifications/")) {
    // Unknown notifications are intentionally ignored and can never dispatch
    // a Memory operation. JSON-RPC forbids sending a response to them.
    return undefined;
  }

  if (request.id === undefined) {
    throw new McpProtocolError("invalid-request", "MCP requests require a JSON-RPC id.");
  }

  if (request.method === "initialize") {
    return ok(request.id, {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "zharwing-memory", version: "0.1.0" },
      capabilities: { tools: {}, prompts: {}, resources: {} },
      instructions: "Zharwing Memory is AI-visible by default inside the active project. Resolve startup state first, read relevant sessions, start a fresh work session, save checkpoints, and never store secrets."
    });
  }

  if (request.method === "ping") {
    requireEmptyParams(request.params);
    return ok(request.id, {});
  }

  if (request.method === "tools/list") {
    requireEmptyParams(request.params);
    return ok(request.id, {
      tools: MEMORY_TOOLS.map(({ rpcMethod, ...tool }) => tool)
    });
  }

  if (request.method === "tools/call") {
    const call = parseToolCall(request.params);
    return ok(request.id, await dispatchTool(call, { requestId: request.id }));
  }

  if (request.method === "prompts/list") {
    requireEmptyParams(request.params);
    return ok(request.id, {
      prompts: MEMORY_PROMPTS.map((prompt) => ({
        name: prompt.name,
        description: prompt.text
      }))
    });
  }

  if (request.method === "resources/list") {
    requireEmptyParams(request.params);
    return ok(request.id, {
      resources: MEMORY_PROMPTS.map((prompt) => ({
        uri: prompt.uri,
        name: prompt.name,
        mimeType: "text/plain"
      }))
    });
  }

  if (request.method === "resources/read") {
    const params = requireExactObject(request.params, ["uri"], "resources/read params");
    if (typeof params.uri !== "string") {
      throw new McpProtocolError("invalid-params", "The resource uri is not valid.");
    }
    const prompt = MEMORY_PROMPTS.find((candidate) => candidate.uri === params.uri);
    if (!prompt) throw new McpProtocolError("invalid-params", "Unknown resource.");
    return ok(request.id, {
      contents: [{ uri: prompt.uri, mimeType: "text/plain", text: prompt.text }]
    });
  }

  throw new McpProtocolError("method-not-found", "Unknown MCP method.");
}

export async function handleMcpJsonRpcPayload(
  payload: unknown,
  dispatchTool: McpToolDispatcher = dispatchMemoryTool
): Promise<JsonRpcResponse | JsonRpcResponse[] | undefined> {
  if (!Array.isArray(payload)) return safeHandleMcpRequest(payload, dispatchTool);
  if (payload.length === 0) {
    return errorResponse(null, new McpProtocolError("invalid-request", "An empty batch is invalid."));
  }
  if (payload.length > 256) {
    return errorResponse(null, new McpProtocolError("invalid-request", "The batch is too large."));
  }

  // Validate and index the whole batch before dispatch. Duplicate typed ids
  // are rejected as a group so two mutations can never share one caller key.
  const parsed = payload.map((candidate) => {
    try {
      return { request: parseJsonRpcRequest(candidate) } as const;
    } catch (error) {
      return { response: errorResponse(readValidRequestId(candidate), error) } as const;
    }
  });
  const counts = new Map<string, number>();
  for (const item of parsed) {
    const request = item.request;
    if (!request || request.id === undefined) continue;
    const key = jsonRpcRequestIdentityKey(request.id);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const responses = await Promise.all(parsed.map((item) => {
    const request = item.request;
    if (!request) return item.response;
    const id = request.id;
    if (id !== undefined && (counts.get(jsonRpcRequestIdentityKey(id)) ?? 0) > 1) {
      return errorResponse(id, new McpProtocolError("invalid-request", "Duplicate JSON-RPC request id."));
    }
    return safeHandleParsedMcpRequest(request, dispatchTool);
  }));
  const filtered = responses.filter((response): response is JsonRpcResponse => Boolean(response));
  return filtered.length ? filtered : undefined;
}

export function serveMcpStdio(dispatchTool: McpToolDispatcher = dispatchMemoryTool): void {
  let inputBuffer = Buffer.alloc(0);
  let drainQueue = Promise.resolve();
  const keepAlive = setInterval(() => {}, 2 ** 30);

  process.stdin.on("data", (chunk) => {
    inputBuffer = Buffer.concat([inputBuffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    if (inputBuffer.byteLength > MAX_STDIO_MESSAGE_BYTES + MAX_STDIO_HEADER_BYTES) {
      const mode: TransportMode = looksLikeFrameStart() ? "framed" : "line";
      inputBuffer = Buffer.alloc(0);
      process.stdin.pause();
      clearInterval(keepAlive);
      writeResponse(errorResponse(null, new McpProtocolError("invalid-request", "MCP message is too large.")), mode);
      return;
    }
    drainQueue = drainQueue.then(drainInput).catch(() => {
      reportFatal();
      process.stdin.pause();
      clearInterval(keepAlive);
      process.exitCode = 1;
    });
  });
  process.stdin.on("end", () => clearInterval(keepAlive));
  process.stdin.on("close", () => clearInterval(keepAlive));
  process.stdin.resume();

  async function drainInput(): Promise<void> {
    while (true) {
      let parsed: ParsedMessage | undefined;
      try {
        parsed = readNextMessage();
      } catch (error) {
        const mode = error instanceof StdioParseError ? error.mode : "line";
        writeResponse(errorResponse(null, new McpProtocolError("parse-error", "Invalid JSON.")), mode);
        continue;
      }
      if (!parsed) return;
      await handleMessage(parsed);
    }
  }

  async function handleMessage({ mode, payload }: ParsedMessage): Promise<void> {
    const response = await handleMcpJsonRpcPayload(payload, dispatchTool);
    if (response) writeResponse(response, mode);
  }

  function readNextMessage(): ParsedMessage | undefined {
    return looksLikeFrameStart() ? readFramedMessage() : readLineMessage();
  }

  function readFramedMessage(): ParsedMessage | undefined {
    const headerEnd = findHeaderEnd(inputBuffer);
    if (!headerEnd) {
      if (inputBuffer.byteLength > MAX_STDIO_HEADER_BYTES) {
        inputBuffer = Buffer.alloc(0);
        throw new StdioParseError("framed");
      }
      return undefined;
    }

    const headerText = inputBuffer.subarray(0, headerEnd.index).toString("utf8");
    const length = contentLength(headerText);
    if (length === undefined || length > MAX_STDIO_MESSAGE_BYTES) {
      inputBuffer = Buffer.alloc(0);
      throw new StdioParseError("framed");
    }

    const bodyStart = headerEnd.index + headerEnd.length;
    const messageEnd = bodyStart + length;
    if (inputBuffer.length < messageEnd) return undefined;

    const body = inputBuffer.subarray(bodyStart, messageEnd).toString("utf8");
    inputBuffer = inputBuffer.subarray(messageEnd);
    try {
      return { mode: "framed", payload: JSON.parse(body) };
    } catch {
      throw new StdioParseError("framed");
    }
  }

  function readLineMessage(): ParsedMessage | undefined {
    while (true) {
      const newlineIndex = inputBuffer.indexOf(0x0a);
      if (newlineIndex === -1) return undefined;

      const line = inputBuffer.subarray(0, newlineIndex + 1).toString("utf8").trim();
      inputBuffer = inputBuffer.subarray(newlineIndex + 1);
      if (!line) continue;
      try {
        return { mode: "line", payload: JSON.parse(line) };
      } catch {
        throw new StdioParseError("line");
      }
    }
  }

  function looksLikeFrameStart(): boolean {
    const prefix = inputBuffer.subarray(0, Math.min(inputBuffer.length, 32)).toString("utf8");
    return /^content-length:/i.test(prefix);
  }
}

class StdioParseError extends Error {
  constructor(readonly mode: TransportMode) {
    super("stdio parse error");
  }
}

function findHeaderEnd(buffer: Buffer): { index: number; length: number } | undefined {
  const crlf = buffer.indexOf("\r\n\r\n");
  if (crlf !== -1) return { index: crlf, length: 4 };
  const lf = buffer.indexOf("\n\n");
  if (lf !== -1) return { index: lf, length: 2 };
  return undefined;
}

function contentLength(headerText: string): number | undefined {
  const values: number[] = [];
  for (const line of headerText.split(/\r?\n/)) {
    const match = /^content-length:\s*(\d+)\s*$/i.exec(line);
    if (match) values.push(Number(match[1]));
  }
  return values.length === 1 && Number.isSafeInteger(values[0]) ? values[0] : undefined;
}

function writeResponse(
  response: JsonRpcResponse | JsonRpcResponse[],
  mode: TransportMode
): void {
  const payload = Buffer.from(JSON.stringify(response), "utf8");
  if (mode === "framed") {
    process.stdout.write(`Content-Length: ${payload.byteLength}\r\n\r\n`);
    process.stdout.write(payload);
    return;
  }
  process.stdout.write(`${payload.toString("utf8")}\n`);
}

async function safeHandleMcpRequest(
  request: unknown,
  dispatchTool: McpToolDispatcher
): Promise<JsonRpcResponse | undefined> {
  try {
    return await handleMcpRequest(request, dispatchTool);
  } catch (error) {
    return errorResponse(readValidRequestId(request), error);
  }
}

async function safeHandleParsedMcpRequest(
  request: JsonRpcRequest,
  dispatchTool: McpToolDispatcher
): Promise<JsonRpcResponse | undefined> {
  try {
    return await handleMcpRequest(request, dispatchTool);
  } catch (error) {
    return errorResponse(request.id ?? null, error);
  }
}

function parseJsonRpcRequest(value: unknown): JsonRpcRequest {
  if (!isPlainObject(value)) {
    throw new McpProtocolError("invalid-request", "JSON-RPC request must be an object.");
  }
  const allowedKeys = new Set(["jsonrpc", "id", "method", "params"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new McpProtocolError("invalid-request", "JSON-RPC request contains unsupported fields.");
  }
  const record = value;
  if (record.jsonrpc !== "2.0") {
    throw new McpProtocolError("invalid-request", "Unsupported JSON-RPC version.");
  }
  if (typeof record.method !== "string" || record.method.length === 0 || record.method.length > 128) {
    throw new McpProtocolError("invalid-request", "Invalid JSON-RPC method.");
  }
  const id = Object.prototype.hasOwnProperty.call(record, "id")
    ? parseJsonRpcRequestId(record.id)
    : undefined;
  if (record.params !== undefined && !isPlainObject(record.params)) {
    throw new McpProtocolError("invalid-request", "JSON-RPC params must be an object.");
  }
  return {
    jsonrpc: "2.0",
    ...(id !== undefined ? { id } : {}),
    method: record.method,
    ...(record.params !== undefined ? { params: record.params as Record<string, unknown> } : {})
  };
}

function parseToolCall(params: Record<string, unknown> | undefined): McpToolCall {
  const record = requireExactObject(params, ["name", "arguments"], "tools/call params");
  if (typeof record.name !== "string" || record.name.length === 0 || record.name.length > 128) {
    throw new McpProtocolError("invalid-params", "The tool name is not valid.");
  }
  if (record.arguments !== undefined && !isPlainObject(record.arguments)) {
    throw new McpProtocolError("invalid-params", "Tool arguments must be an object.");
  }
  // Preserve object identity: the hardened HTTP host indexes request params
  // before invoking this shared handler, while the typed context carries the
  // same identity for stdio and new integrations.
  return record as unknown as McpToolCall;
}

function requireEmptyParams(params: Record<string, unknown> | undefined): void {
  if (params && Object.keys(params).length > 0) {
    throw new McpProtocolError("invalid-params", "This method does not accept params.");
  }
}

function requireExactObject(
  value: unknown,
  allowedKeys: readonly string[],
  label: string
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new McpProtocolError("invalid-params", `${label} must be an object.`);
  }
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new McpProtocolError("invalid-params", `${label} contains unsupported fields.`);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readValidRequestId(value: unknown): JsonRpcRequestId | null {
  if (!isPlainObject(value) || !Object.prototype.hasOwnProperty.call(value, "id")) return null;
  try {
    return parseJsonRpcRequestId(value.id);
  } catch {
    return null;
  }
}

function ok(id: JsonRpcRequestId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(id: JsonRpcRequestId | null, error: unknown): JsonRpcResponse {
  if (error instanceof OperationError) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message: error.message,
        data: error.publicError
      }
    };
  }
  const protocol = error instanceof McpProtocolError ? error : undefined;
  const code = protocolCode(protocol?.kind ?? "internal");
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message: protocolMessage(protocol?.kind ?? "internal")
    }
  };
}

function protocolCode(kind: McpProtocolError["kind"]): number {
  switch (kind) {
    case "parse-error": return -32700;
    case "invalid-request": return -32600;
    case "method-not-found": return -32601;
    case "invalid-params": return -32602;
    case "internal": return -32603;
  }
}

function protocolMessage(kind: McpProtocolError["kind"]): string {
  switch (kind) {
    case "parse-error": return "Parse error";
    case "invalid-request": return "Invalid request";
    case "method-not-found": return "Method not found";
    case "invalid-params": return "Invalid params";
    case "internal": return "Tool request failed";
  }
}

function reportFatal(): void {
  // Never serialize an upstream exception: it may contain request or host data.
  process.stderr.write("MCP_SERVER_FAILURE\n");
}
