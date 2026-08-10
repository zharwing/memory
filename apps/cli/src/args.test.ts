import assert from "node:assert/strict";
import test from "node:test";

import { flagBool, parseArgs } from "./args.js";

test("boolean flags do not consume a following positional summary", () => {
  const parsed = parseArgs([
    "close",
    "--project",
    "demo-project",
    "--session",
    "session-1",
    "--no-auto-summary",
    "Runtime audit completed"
  ]);

  assert.deepEqual(parsed.positional, ["Runtime audit completed"]);
  assert.equal(parsed.flags.project, "demo-project");
  assert.equal(parsed.flags.session, "session-1");
  assert.equal(flagBool(parsed.flags, "no-auto-summary"), true);
});

test("value-bearing flags retain their following values", () => {
  const parsed = parseArgs([
    "checkpoint",
    "--project",
    "demo-project",
    "--next",
    "Verify browser UI",
    "Checkpoint saved"
  ]);

  assert.deepEqual(parsed.positional, ["Checkpoint saved"]);
  assert.equal(parsed.flags.project, "demo-project");
  assert.equal(parsed.flags.next, "Verify browser UI");
});

test("boolean flags remain true when followed by another flag", () => {
  const parsed = parseArgs(["context", "--preview", "--project", "demo-project"]);

  assert.deepEqual(parsed.positional, []);
  assert.equal(flagBool(parsed.flags, "preview"), true);
  assert.equal(parsed.flags.project, "demo-project");
});
