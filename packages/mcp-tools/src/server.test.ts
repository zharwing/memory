import assert from "node:assert/strict";
import test from "node:test";
import { handleMcpRequest } from "./server.js";

test("lists memory tools through MCP", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {}
  });

  const tools = (response?.result as any).tools as Array<{ name: string }>;
  assert.equal(response?.jsonrpc, "2.0");
  assert.ok(tools.some((tool) => tool.name === "memory.get_startup_state"));
  assert.ok(tools.some((tool) => tool.name === "memory.start_session"));
});

test("ignores initialized notifications", async () => {
  const response = await handleMcpRequest({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  });

  assert.equal(response, undefined);
});
