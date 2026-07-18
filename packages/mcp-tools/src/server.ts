import { dispatchMemoryTool, type McpToolCall } from "./dispatch.js";
import { MEMORY_PROMPTS } from "./prompts.js";
import { MEMORY_TOOLS } from "./tools.js";

export interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export type McpToolDispatcher = (call: McpToolCall) => Promise<unknown>;

type TransportMode = "framed" | "line";

interface ParsedMessage {
  mode: TransportMode;
  request: JsonRpcRequest;
}

export async function handleMcpRequest(
  request: JsonRpcRequest,
  dispatchTool: McpToolDispatcher = dispatchMemoryTool
): Promise<JsonRpcResponse | undefined> {
  if (request.method === "notifications/initialized") return undefined;

  if (request.method === "initialize") {
    return ok(request.id, {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "zharwing-memory", version: "0.1.0" },
      capabilities: { tools: {}, prompts: {}, resources: {} },
      instructions: "Use Zharwing Memory only for the active project. Resolve startup state first, then read relevant sessions, start a fresh work session, save checkpoints, and avoid storing secrets."
    });
  }

  if (request.method === "ping") {
    return ok(request.id, {});
  }

  if (request.method === "tools/list") {
    return ok(request.id, {
      tools: MEMORY_TOOLS.map(({ rpcMethod, ...tool }) => tool)
    });
  }

  if (request.method === "tools/call") {
    const params = request.params as { name: string; arguments?: Record<string, unknown> };
    return ok(request.id, await dispatchTool(params));
  }

  if (request.method === "prompts/list") {
    return ok(request.id, {
      prompts: MEMORY_PROMPTS.map((prompt) => ({
        name: prompt.name,
        description: prompt.text
      }))
    });
  }

  if (request.method === "resources/list") {
    return ok(request.id, {
      resources: MEMORY_PROMPTS.map((prompt) => ({
        uri: prompt.uri,
        name: prompt.name,
        mimeType: "text/plain"
      }))
    });
  }

  if (request.method === "resources/read") {
    const uri = String(request.params?.uri || "");
    const prompt = MEMORY_PROMPTS.find((candidate) => candidate.uri === uri);
    if (!prompt) throw new Error(`Unknown resource: ${uri}`);
    return ok(request.id, {
      contents: [{ uri: prompt.uri, mimeType: "text/plain", text: prompt.text }]
    });
  }

  throw new Error(`Unknown MCP method: ${request.method}`);
}

export async function handleMcpJsonRpcPayload(
  payload: JsonRpcRequest | JsonRpcRequest[],
  dispatchTool: McpToolDispatcher = dispatchMemoryTool
): Promise<JsonRpcResponse | JsonRpcResponse[] | undefined> {
  if (Array.isArray(payload)) {
    const responses = await Promise.all(payload.map((request) => safeHandleMcpRequest(request, dispatchTool)));
    const filtered = responses.filter((response): response is JsonRpcResponse => Boolean(response));
    return filtered.length ? filtered : undefined;
  }
  return safeHandleMcpRequest(payload, dispatchTool);
}

export function serveMcpStdio(dispatchTool: McpToolDispatcher = dispatchMemoryTool): void {
  let inputBuffer = Buffer.alloc(0);
  let drainQueue = Promise.resolve();
  const keepAlive = setInterval(() => {}, 2 ** 30);

  process.stdin.on("data", (chunk) => {
    inputBuffer = Buffer.concat([inputBuffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    drainQueue = drainQueue.then(drainInput, reportFatal);
  });
  process.stdin.on("end", () => clearInterval(keepAlive));
  process.stdin.on("close", () => clearInterval(keepAlive));
  process.stdin.resume();

  async function drainInput(): Promise<void> {
    while (true) {
      const parsed = readNextMessage();
      if (!parsed) return;
      await handleMessage(parsed);
    }
  }

  async function handleMessage({ mode, request }: ParsedMessage): Promise<void> {
    try {
      const response = await handleMcpRequest(request, dispatchTool);
      if (response) writeResponse(response, mode);
    } catch (error) {
      if (request.id === undefined) {
        reportFatal(error);
        return;
      }
      writeResponse(errorResponse(request.id, error), mode);
    }
  }

  function readNextMessage(): ParsedMessage | undefined {
    const framed = readFramedMessage();
    if (framed) return framed;
    if (looksLikeFrameStart()) return undefined;
    return readLineMessage();
  }

  function readFramedMessage(): ParsedMessage | undefined {
    const headerEnd = findHeaderEnd(inputBuffer);
    if (!headerEnd) return undefined;

    const headerText = inputBuffer.subarray(0, headerEnd.index).toString("utf8");
    const length = contentLength(headerText);
    if (length === undefined) return undefined;

    const bodyStart = headerEnd.index + headerEnd.length;
    const messageEnd = bodyStart + length;
    if (inputBuffer.length < messageEnd) return undefined;

    const body = inputBuffer.subarray(bodyStart, messageEnd).toString("utf8");
    inputBuffer = inputBuffer.subarray(messageEnd);
    return { mode: "framed", request: JSON.parse(body) as JsonRpcRequest };
  }

  function readLineMessage(): ParsedMessage | undefined {
    while (true) {
      const newlineIndex = inputBuffer.indexOf(0x0a);
      if (newlineIndex === -1) return undefined;

      const line = inputBuffer.subarray(0, newlineIndex + 1).toString("utf8").trim();
      inputBuffer = inputBuffer.subarray(newlineIndex + 1);
      if (!line) continue;
      return { mode: "line", request: JSON.parse(line) as JsonRpcRequest };
    }
  }

  function looksLikeFrameStart(): boolean {
    const prefix = inputBuffer.subarray(0, Math.min(inputBuffer.length, 32)).toString("utf8");
    return /^content-length:/i.test(prefix);
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
  for (const line of headerText.split(/\r?\n/)) {
    const match = /^content-length:\s*(\d+)\s*$/i.exec(line);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function writeResponse(response: JsonRpcResponse, mode: TransportMode): void {
  const payload = Buffer.from(JSON.stringify(response), "utf8");
  if (mode === "framed") {
    process.stdout.write(`Content-Length: ${payload.byteLength}\r\n\r\n`);
    process.stdout.write(payload);
    return;
  }
  process.stdout.write(`${payload.toString("utf8")}\n`);
}

async function safeHandleMcpRequest(
  request: JsonRpcRequest,
  dispatchTool: McpToolDispatcher
): Promise<JsonRpcResponse | undefined> {
  try {
    return await handleMcpRequest(request, dispatchTool);
  } catch (error) {
    return errorResponse(request.id, error);
  }
}

function ok(id: string | number | undefined, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function errorResponse(id: string | number | undefined, error: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code: -32000,
      message: error instanceof Error ? error.message : String(error)
    }
  };
}

function reportFatal(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
}
