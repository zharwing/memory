import assert from "node:assert/strict";
import { test } from "node:test";
import { MEMORY_TOOLS } from "@zharwing/memory-mcp";
import { assertSupportedSchema, SchemaSupportError, validateValue, type SchemaNode } from "./schema-validate.js";
import { requireParams, RpcValidationError } from "./rpc-params.js";

test("every advertised MCP tool schema stays within the validator's subset", () => {
  for (const tool of MEMORY_TOOLS) {
    assert.doesNotThrow(() =>
      assertSupportedSchema(tool.inputSchema as unknown as Record<string, unknown>, tool.rpcMethod)
    );
  }
});

test("unsupported schema keywords and types fail loudly", () => {
  assert.throws(
    () => assertSupportedSchema({ type: "string", pattern: "^x" }, "ctx"),
    (error: unknown) => error instanceof SchemaSupportError && /pattern/.test((error as Error).message)
  );
  assert.throws(
    () => assertSupportedSchema({ type: "null" }, "ctx"),
    SchemaSupportError
  );
  // Unsupported keywords nested under items/properties are caught too.
  assert.throws(
    () => assertSupportedSchema({ type: "array", items: { type: "string", minLength: 1 } }, "ctx"),
    SchemaSupportError
  );
  assert.throws(
    () => assertSupportedSchema({ type: "object", properties: { a: { oneOf: [] } } }, "ctx"),
    SchemaSupportError
  );
});

test("validateValue accepts conforming values", () => {
  const schema: SchemaNode = {
    type: "object",
    properties: {
      projectId: { type: "string" },
      limit: { type: "number", minimum: 1, maximum: 200 },
      autoSummarize: { type: "boolean" },
      sections: { type: "array", items: { type: "string", enum: ["body", "checkpoints"] } }
    },
    required: ["projectId"]
  };
  assert.deepEqual(
    validateValue({ projectId: "p1", limit: 5, autoSummarize: true, sections: ["body"] }, schema, "params"),
    []
  );
  // Unknown extra keys are allowed; optional keys may be absent or null.
  assert.deepEqual(validateValue({ projectId: "p1", extra: 42, limit: null }, schema, "params"), []);
});

test("validateValue rejects wrong types with precise paths", () => {
  assert.deepEqual(validateValue(7, { type: "string" }, "params.projectId"), ["params.projectId must be a string"]);
  assert.deepEqual(validateValue("yes", { type: "boolean" }, "params.autoSummarize"), [
    "params.autoSummarize must be a boolean"
  ]);
  assert.deepEqual(validateValue("step", { type: "array", items: { type: "string" } }, "params.nextSteps"), [
    "params.nextSteps must be an array"
  ]);
  assert.deepEqual(validateValue([1], { type: "array", items: { type: "string" } }, "params.nextSteps"), [
    "params.nextSteps[0] must be a string"
  ]);
  assert.deepEqual(validateValue([], { type: "object" }, "params"), ["params must be an object"]);
  assert.deepEqual(validateValue(2.5, { type: "integer", minimum: 1 }, "params.limit"), [
    "params.limit must be an integer >= 1"
  ]);
});

test("validateValue enforces enum, minimum, maximum, and required", () => {
  const item: SchemaNode = { type: "string", enum: ["body", "checkpoints"] };
  assert.deepEqual(validateValue("graph", item, "params.sections[0]"), [
    "params.sections[0] must be one of: body, checkpoints"
  ]);
  const limit: SchemaNode = { type: "number", minimum: 1, maximum: 200 };
  assert.deepEqual(validateValue(0, limit, "params.limit"), ["params.limit must be a number between 1 and 200"]);
  assert.deepEqual(validateValue(500, limit, "params.limit"), ["params.limit must be a number between 1 and 200"]);
  assert.deepEqual(validateValue({}, { type: "object", required: ["projectId"] }, "params"), [
    "params.projectId is required"
  ]);
});

test("requireParams surfaces schema violations as RpcValidationError", () => {
  assert.throws(
    () => requireParams({ projectId: "p1", limit: 0 }, "memory.get_recent_sessions"),
    (error: unknown) =>
      error instanceof RpcValidationError && /params\.limit must be a number between 1 and 200/.test((error as Error).message)
  );
  assert.throws(
    () => requireParams({ projectId: "p1", sessionId: "s1", sections: ["body", "graph"] }, "memory.get_session_detail"),
    (error: unknown) =>
      error instanceof RpcValidationError && /params\.sections\[1\] must be one of: body, checkpoints/.test((error as Error).message)
  );
  assert.throws(
    () => requireParams({ projectId: 42, query: "q" }, "memory.search"),
    (error: unknown) => error instanceof RpcValidationError && /params\.projectId must be a string/.test((error as Error).message)
  );
});
