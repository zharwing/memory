import http from "node:http";
import type { DaemonConfig } from "./config.js";
import { MemoryService } from "./memory-service.js";
import { dispatchRpc, type RpcRequest } from "./rpc.js";

export function createDaemonServer(config: DaemonConfig, service = new MemoryService({ memoryRoot: config.memoryRoot })) {
  return http.createServer(async (request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");

    if (request.method === "GET" && request.url === "/health") {
      response.end(JSON.stringify({ status: "ok", memoryRoot: config.memoryRoot }));
      return;
    }

    if (request.method !== "POST" || request.url !== "/rpc") {
      response.statusCode = 404;
      response.end(JSON.stringify({ ok: false, error: { message: "Not found" } }));
      return;
    }

    const auth = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (config.authToken && auth !== config.authToken) {
      response.statusCode = 401;
      response.end(JSON.stringify({ ok: false, error: { message: "Unauthorized" } }));
      return;
    }

    const body = await readRequestBody(request);
    const rpcRequest = JSON.parse(body) as RpcRequest;
    const rpcResponse = await dispatchRpc(service, rpcRequest);
    response.statusCode = rpcResponse.ok ? 200 : 400;
    response.end(JSON.stringify(rpcResponse));
  });
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
