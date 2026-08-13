import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAuthMode } from "./config.js";

test("personal preview is seamless by default while hardened mode remains authenticated", () => {
  assert.equal(resolveAuthMode("personal-preview", undefined), "none");
  assert.equal(resolveAuthMode("personal-preview", ""), "none");
  assert.equal(resolveAuthMode("personal-preview", "none"), "none");
  assert.equal(resolveAuthMode("personal-preview", "token"), "token");
  assert.equal(resolveAuthMode("hardened-local", undefined), "token");
  assert.equal(resolveAuthMode("hardened-local", "token"), "token");
  assert.throws(
    () => resolveAuthMode("personal-preview", "tokeen"),
    /ZHARWING_MEMORY_AUTH_MODE must be either 'none' or 'token'/
  );
});
