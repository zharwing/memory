import assert from "node:assert/strict";
import { test } from "node:test";
import { MEMORY_TOOLS } from "./tools.js";

test("startup tool allows the daemon to bind an omitted agent project", () => {
  const startup = MEMORY_TOOLS.find((tool) => tool.name === "memory.get_startup_state");
  assert.ok(startup);
  assert.ok(startup.inputSchema.properties.projectId);
  assert.equal(startup.inputSchema.required?.includes("projectId") ?? false, false);

  const recent = MEMORY_TOOLS.find((tool) => tool.name === "memory.get_recent_sessions");
  assert.ok(recent);
  assert.equal(recent.inputSchema.required?.includes("projectId"), true);
});
