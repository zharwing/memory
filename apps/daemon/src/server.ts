import crypto from "node:crypto";
import http from "node:http";
import { handleMcpJsonRpcPayload, MEMORY_TOOLS, type McpToolCall } from "@zharwing/memory-mcp";
import { dispatchAgentRpc } from "./agent-facade.js";
import { isLoopbackHost, type DaemonConfig } from "./config.js";
import { MemoryService } from "./memory-service.js";
import { dispatchRpc, type RpcRequest } from "./rpc.js";

export const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

export function createDaemonServer(config: DaemonConfig, service = new MemoryService({ memoryRoot: config.memoryRoot })) {
  return http.createServer(async (request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");

    // DNS-rebinding defense: a loopback daemon only answers requests whose
    // Host header still names a loopback address.
    if (!hasLoopbackHostHeader(request)) {
      response.statusCode = 403;
      response.end(JSON.stringify({ ok: false, error: { message: "Host not allowed" } }));
      return;
    }

    if (!setCorsHeaders(request, response)) {
      response.statusCode = 403;
      response.end(JSON.stringify({ ok: false, error: { message: "Origin not allowed" } }));
      return;
    }

    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    // Health stays unauthenticated but minimal: no paths, no configuration.
    if (request.method === "GET" && request.url === "/health") {
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (request.method === "GET" && request.url === "/") {
      response.end(JSON.stringify({
        status: "ok",
        service: "Zharwing Memory daemon",
        message: "This is the local daemon API, not the desktop UI.",
        endpoints: {
          health: "/health",
          rpc: "/rpc",
          mcp: "/mcp"
        }
      }));
      return;
    }

    if (request.method !== "POST" || !["/rpc", "/mcp", "/agent-rpc"].includes(request.url || "")) {
      response.statusCode = 404;
      response.end(JSON.stringify({ ok: false, error: { message: "Not found" } }));
      return;
    }

    if (!isAuthorized(config, request)) {
      response.statusCode = 401;
      response.end(JSON.stringify({ ok: false, error: { message: "Unauthorized" } }));
      return;
    }

    // Agent-facing access requires an explicit local opt-in.
    if (["/mcp", "/agent-rpc"].includes(request.url || "") && !config.agentSurfaceEnabled) {
      response.statusCode = 403;
      response.end(JSON.stringify({
        ok: false,
        error: {
          code: "AGENT_SURFACE_DISABLED",
          message: "Set ZHARWING_MEMORY_AGENT_SURFACE=enabled to allow authenticated AI memory access."
        }
      }));
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
      // /agent-rpc goes through the audience-checked facade; /rpc remains the
      // authenticated control-plane surface for the desktop app and CLI.
      const rpcResponse =
        request.url === "/agent-rpc"
          ? await dispatchAgentRpc(service, rpcRequest)
          : await dispatchRpc(service, rpcRequest);
      response.statusCode = rpcResponse.ok ? 200 : 400;
      response.end(JSON.stringify(rpcResponse));
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        response.statusCode = 413;
        response.end(JSON.stringify({ ok: false, error: { message: "Request body too large" } }));
        return;
      }
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
  // MCP is an agent surface: every tool call goes through the audience-checked
  // facade, never straight into control-plane dispatch.
  const response = await dispatchAgentRpc(service, {
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
  if (!config.authToken) return false;
  const auth = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!auth || auth.length !== config.authToken.length) return false;
  return crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(config.authToken));
}

function hasLoopbackHostHeader(request: http.IncomingMessage): boolean {
  const host = request.headers.host;
  if (!host) return false;
  try {
    return isLoopbackHost(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

// Browser callers must come from a loopback origin regardless of auth mode;
// arbitrary origins are never reflected back.
function setCorsHeaders(request: http.IncomingMessage, response: http.ServerResponse): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (!isLocalOrigin(origin)) return false;
  response.setHeader("access-control-allow-origin", origin);
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

class BodyTooLargeError extends Error {}

function readRequestBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_REQUEST_BODY_BYTES) {
        reject(new BodyTooLargeError());
        request.destroy();
      }
    });
    request.on("end", () => resolve(body || "{}"));
    request.on("error", reject);
  });
}
