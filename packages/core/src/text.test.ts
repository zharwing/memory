import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSlug } from "./text.js";

test("normalizeSlug trims boundary dashes while preserving allowed internal runs", () => {
  const internal = "-".repeat(32_768);
  assert.equal(
    normalizeSlug(`---Alpha${internal}Beta---`, {
      collapse: /[^a-z0-9-]+/g
    }),
    `alpha${internal}beta`
  );
});
