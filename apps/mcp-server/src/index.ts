#!/usr/bin/env node
import readline from "node:readline";
import { dispatchMemoryTool, MEMORY_PROMPTS, MEMORY_TOOLS } from "@aimem/mcp-tools";

interface JsonRpcRequest {
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on("line", async (line) => {
  if (!line.trim()) return;
  const request = JSON.parse(line) as JsonRpcRequest;
  const response = await handle(request);
  process.stdout.write(`${JSON.stringify(response)}\n`);
});

async function handle(request: JsonRpcRequest) {
  try {
    if (request.method === "initialize") {
      return ok(request.id, {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "aimem", version: "0.1.0" },
        capabilities: { tools: {}, prompts: {}, resources: {} }
      });
    }

    if (request.method === "tools/list") {
      return ok(request.id, {
        tools: MEMORY_TOOLS.map(({ rpcMethod, ...tool }) => tool)
      });
    }

    if (request.method === "tools/call") {
      const params = request.params as { name: string; arguments?: Record<string, unknown> };
      return ok(request.id, await dispatchMemoryTool(params));
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
  } catch (error) {
    return {
      id: request.id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

function ok(id: string | number | undefined, result: unknown) {
  return { id, result };
}
