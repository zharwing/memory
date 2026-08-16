import assert from "node:assert/strict";
import test from "node:test";
import { resolveGraphRelationshipMode } from "./useGraphRouteState.js";

test("graph routes retain the persisted relationship mode when the query is absent", () => {
  assert.equal(resolveGraphRelationshipMode(undefined, "deterministic"), "deterministic");
  assert.equal(resolveGraphRelationshipMode(null, "ai-reviewed"), "ai-reviewed");
});

test("an explicit valid relationship query overrides the persisted mode", () => {
  assert.equal(resolveGraphRelationshipMode("deterministic", "ai-reviewed"), "deterministic");
  assert.equal(resolveGraphRelationshipMode("ai-reviewed", "deterministic"), "ai-reviewed");
});

test("an invalid relationship query falls back to the persisted mode", () => {
  assert.equal(resolveGraphRelationshipMode("unknown", "deterministic"), "deterministic");
});
