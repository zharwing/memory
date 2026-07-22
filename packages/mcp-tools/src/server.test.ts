import assert from "node:assert/strict";
import test from "node:test";
import { handleMcpRequest } from "./server.js";

test("lists only the supported daily memory tools through MCP", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {}
  });

  const tools = (response?.result as any).tools as Array<{ name: string }>;
  assert.equal(response?.jsonrpc, "2.0");
  assert.deepEqual(tools.map((tool) => tool.name), [
    "memory.health",
    "memory.get_startup_state",
    "memory.get_latest_session",
    "memory.get_recent_sessions",
    "memory.start_session",
    "memory.search",
    "memory.preview_context_bundle",
    "memory.get_context_bundle",
    "memory.save_checkpoint",
    "memory.close_session"
  ]);
});

test("ignores initialized notifications", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  });

  assert.equal(response, undefined);
});
