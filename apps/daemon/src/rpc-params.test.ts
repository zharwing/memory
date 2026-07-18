import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { REQUIRED_PARAMS, requireParams, RpcValidationError } from "./rpc-params.js";

const RPC_SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "daemon", "src", "rpc.ts");

test("every RPC method that validates params has a registry entry (no drift)", async () => {
  const source = await fs.readFile(RPC_SOURCE, "utf8");
  const methods = [...new Set([...source.matchAll(/case "(memory\.[a-z_]+)"/g)].map((m) => m[1]))];
  assert.ok(methods.length > 50, `expected the full inventory, found ${methods.length}`);

  // Methods that take no params object or construct params inline are exempt;
  // every method that flows params through requireParams must be registered.
  const exempt = new Set([
    "memory.health",
    "memory.list_projects",
    "memory.get_project",
    "memory.detect_project",
    "memory.get_startup_state",
    "memory.list_import_profiles",
    "memory.list_trash"
  ]);
  const unregistered = methods.filter((m) => !exempt.has(m) && !(m in REQUIRED_PARAMS));
  assert.deepEqual(unregistered, [], `unregistered RPC methods: ${unregistered.join(", ")}`);
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
  assert.doesNotThrow(() => requireParams({}, "memory.empty_trash"));
});
