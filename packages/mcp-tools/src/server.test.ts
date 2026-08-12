import assert from "node:assert/strict";
import test from "node:test";
import { deriveMcpMutationIdempotencyKey } from "./request-identity.js";
import { handleMcpJsonRpcPayload, handleMcpRequest } from "./server.js";

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
    "memory.get_session_detail",
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

test("preserves the typed request identity through tool dispatch", async () => {
  const observed: Array<string | number> = [];
  const payload = [
    { jsonrpc: "2.0", id: "1", method: "tools/call", params: { name: "memory.health", arguments: {} } },
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "memory.health", arguments: {} } }
  ];

  const response = await handleMcpJsonRpcPayload(payload, async (_call, context) => {
    observed.push(context.requestId);
    return { ok: true };
  });

  assert.deepEqual(observed, ["1", 1]);
  assert.ok(Array.isArray(response));
  if (!Array.isArray(response)) return;
  assert.deepEqual(response.map((item) => item.id), ["1", 1]);
  assert.notEqual(
    deriveMcpMutationIdempotencyKey("1", "memory.start_session"),
    deriveMcpMutationIdempotencyKey(1, "memory.start_session")
  );
});

test("rejects duplicate batch ids before dispatch", async () => {
  let dispatched = 0;
  const response = await handleMcpJsonRpcPayload([
    { jsonrpc: "2.0", id: "retry-a", method: "tools/call", params: { name: "memory.health", arguments: {} } },
    { jsonrpc: "2.0", id: "retry-a", method: "tools/call", params: { name: "memory.health", arguments: {} } }
  ], async () => {
    dispatched += 1;
    return {};
  });

  assert.equal(dispatched, 0);
  assert.ok(Array.isArray(response));
  if (!Array.isArray(response)) return;
  assert.ok(response.every((item) => item.error?.code === -32600));
});

test("rejects a tool call without a request id", async () => {
  let dispatched = false;
  const response = await handleMcpJsonRpcPayload({
    jsonrpc: "2.0",
    method: "tools/call",
    params: { name: "memory.start_session", arguments: { projectId: "project-a" } }
  }, async () => {
    dispatched = true;
    return {};
  });

  assert.equal(dispatched, false);
  assert.equal(Array.isArray(response) ? undefined : response?.error?.code, -32600);
});
