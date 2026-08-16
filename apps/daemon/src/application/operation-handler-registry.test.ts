import test from "node:test";
import assert from "node:assert/strict";
import {
  operationRegistryManifest,
  type OperationName
} from "@zharwing/memory-core";
import { createOperationHandlerRegistry } from "./operation-handler-registry.js";

test("daemon handler registry covers every registered operation", () => {
  const registry = createOperationHandlerRegistry();
  const names = new Set<OperationName>(operationRegistryManifest().map((entry) => entry.name));

  assert.equal(registry.size, names.size);
  for (const name of names) assert.equal(typeof registry.get(name), "function", name);
});
