import http from "node:http";
import { handleMcpJsonRpcPayload, MEMORY_TOOLS, type McpToolCall } from "@aimem/mcp-tools";
import { isLoopbackHost, type DaemonConfig } from "./config.js";
import { MemoryService } from "./memory-service.js";
import { dispatchRpc, type RpcRequest } from "./rpc.js";

export function createDaemonServer(config: DaemonConfig, service = new MemoryService({ memoryRoot: config.memoryRoot })) {
  return http.createServer(async (request, response) => {
    if (!setCorsHeaders(config, request, response)) {
      response.statusCode = 403;
      response.end(JSON.stringify({ ok: false, error: { message: "Origin not allowed" } }));
      return;
    }
    response.setHeader("content-type", "application/json; charset=utf-8");

    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      response.end(JSON.stringify({ status: "ok", memoryRoot: config.memoryRoot, authMode: config.authMode }));
      return;
    }

    if (request.method === "GET" && request.url === "/") {
      response.end(JSON.stringify({
        status: "ok",
        service: "AI Memory daemon",
        message: "This is the local daemon API, not the desktop UI.",
        endpoints: {
          health: "/health",
          rpc: "/rpc",
          mcp: "/mcp"
        }
      }));
      return;
    }

    if (request.method !== "POST" || !["/rpc", "/mcp"].includes(request.url || "")) {
      response.statusCode = 404;
      response.end(JSON.stringify({ ok: false, error: { message: "Not found" } }));
      return;
    }

    if (!isAuthorized(config, request)) {
      response.statusCode = 401;
      response.end(JSON.stringify({ ok: false, error: { message: "Unauthorized" } }));
      return;
    }

    try {
      const body = await readRequestBody(request);
      if (request.url === "/mcp") {
        const payload = JSON.parse(body);
        const mcpResponse = await handleMcpJsonRpcPayload(payload, (call) => dispatchMcpTool(service, call));
        if (!mcpResponse) {
          response.statusCode = 202;
          response.end("");
          return;
        }
        response.end(JSON.stringify(mcpResponse));
        return;
      }

      const rpcRequest = JSON.parse(body) as RpcRequest;
      const rpcResponse = await dispatchRpc(service, rpcRequest);
      response.statusCode = rpcResponse.ok ? 200 : 400;
      response.end(JSON.stringify(rpcResponse));
    } catch (error) {
      response.statusCode = 500;
      response.end(JSON.stringify({
        ok: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      }));
    }
  });
}

async function dispatchMcpTool(service: MemoryService, call: McpToolCall): Promise<unknown> {
  const tool = MEMORY_TOOLS.find((candidate) => candidate.name === call.name);
  if (!tool) throw new Error(`Unknown memory tool: ${call.name}`);
  const response = await dispatchRpc(service, {
    id: Date.now(),
    method: tool.rpcMethod,
    params: call.arguments || {}
  });
  if (!response.ok) throw new Error(response.error?.message || `AIMEM RPC failed: ${tool.rpcMethod}`);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(response.result, null, 2)
      }
    ]
  };
}

function isAuthorized(config: DaemonConfig, request: http.IncomingMessage): boolean {
  if (config.authMode === "none") return true;
  const auth = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  return Boolean(config.authToken && auth === config.authToken);
}

function setCorsHeaders(config: DaemonConfig, request: http.IncomingMessage, response: http.ServerResponse): boolean {
  const origin = request.headers.origin;
  if (config.authMode === "none" && origin && !isLocalOrigin(origin)) return false;
  response.setHeader("access-control-allow-origin", origin || (config.authMode === "none" ? "null" : "*"));
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type,authorization");
  response.setHeader("access-control-max-age", "86400");
  response.setHeader("vary", "Origin");
  return true;
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

function readRequestBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body || "{}"));
    request.on("error", reject);
  });
}
