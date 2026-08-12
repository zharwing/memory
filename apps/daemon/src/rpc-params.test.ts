import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { OPERATION_REGISTRY } from "@zharwing/memory-core";
import { requireParams, RpcValidationError } from "./rpc-params.js";

const RPC_SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "daemon", "src", "rpc.ts");

test("the daemon switch and operation registry have exact parity", async () => {
  const source = await fs.readFile(RPC_SOURCE, "utf8");
  const methods = [...new Set([
    ...source.matchAll(/case "(memory\.[a-z_]+)"/g),
    ...source.matchAll(/invocation\.name === "(memory\.[a-z_]+)"/g)
  ].map((match) => match[1]))].sort();
  const registered = Object.keys(OPERATION_REGISTRY).sort();
  assert.ok(methods.length > 50, `expected the full inventory, found ${methods.length}`);
  assert.deepEqual(methods, registered, "rpc.ts and the core operation authority drifted");
});

test("the RPC boundary no longer uses unchecked as-never casts", async () => {
  const source = await fs.readFile(RPC_SOURCE, "utf8");
  assert.equal(source.includes("as never"), false, "rpc.ts must contain zero `as never` boundary casts");
});

test("requireParams rejects missing required params with a typed error", () => {
  assert.throws(
    () => requireParams({}, "memory.create_project"),
    (error: unknown) => error instanceof RpcValidationError && /preview/.test((error as Error).message)
  );
  assert.throws(() => requireParams({}, "memory.save_checkpoint"), RpcValidationError);
});

test("requireParams rejects non-object params", () => {
  assert.throws(() => requireParams([] as unknown as Record<string, unknown>, "memory.search"), RpcValidationError);
});

test("requireParams accepts params carrying every required key", () => {
  const validated = requireParams<{ projectId: string; query: string }>(
    { projectId: "p1", query: "hello" },
    "memory.search"
  );
  assert.equal(validated.projectId, "p1");
  assert.equal(validated.query, "hello");
});

test("methods with no required params accept an empty object", () => {
  assert.doesNotThrow(() => requireParams({}, "memory.health"));
});

test("project-only creation does not require a working directory", () => {
  const projectOnly = requireParams<{ projectName: string }>(
    { projectName: "Multi Repo Product" },
    "memory.prepare_project_creation"
  );
  const repositoryBacked = requireParams<{ projectName: string; workingDirectory: string }>(
    { projectName: "Single Repo Product", workingDirectory: "C:\\repo" },
    "memory.prepare_project_creation"
  );

  assert.equal(projectOnly.projectName, "Multi Repo Product");
  assert.equal(repositoryBacked.workingDirectory, "C:\\repo");
});

test("agent tool methods enforce their full input schema, not just presence", () => {
  assert.throws(
    () => requireParams({ projectId: "p1", limit: "5" }, "memory.get_recent_sessions"),
    (error: unknown) => error instanceof RpcValidationError && /input\.limit/.test((error as Error).message)
  );
  assert.throws(
    () => requireParams({ projectId: "p1", sessionId: "s1", autoSummarize: "yes" }, "memory.close_session"),
    (error: unknown) => error instanceof RpcValidationError && /input\.autoSummarize must be a boolean/.test((error as Error).message)
  );
  assert.doesNotThrow(() => requireParams({ projectId: "p1", limit: 5 }, "memory.get_recent_sessions"));
});

test("registered operation schemas reject unknown extra keys", () => {
  assert.throws(
    () => requireParams({ projectId: "p1", query: "q", extra: "ignored" }, "memory.search"),
    (error: unknown) => error instanceof RpcValidationError && /input\.extra/.test((error as Error).message)
  );
});

test("control-plane methods receive the same complete runtime validation", () => {
  assert.throws(
    () => requireParams({ projectId: 42 }, "memory.get_project"),
    (error: unknown) => error instanceof RpcValidationError && /input\.projectId must be a string/.test((error as Error).message)
  );
  assert.doesNotThrow(() => requireParams({ projectId: "p1" }, "memory.get_project"));
});
