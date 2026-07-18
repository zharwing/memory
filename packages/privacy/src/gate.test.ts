import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PRIVACY_POLICY } from "@zharwing/memory-core";
import { applyPrivacyGate, combineSafetyStatus } from "./gate.js";

test("applyPrivacyGate excludes blocked visibility and never-send paths", () => {
  const neverSendVisibility = applyPrivacyGate(
    {
      id: "doc-private",
      projectId: "project-a",
      type: "document",
      title: "Private Notes",
      visibility: "never-send",
      sourcePath: "docs/private-notes.md",
      content: "This content must not be sent."
    },
    DEFAULT_PRIVACY_POLICY
  );

  assert.equal(neverSendVisibility.allowed, false);
  assert.equal(neverSendVisibility.excluded?.reason, "never-send");
  assert.equal(neverSendVisibility.content, "");

  const neverSendPath = applyPrivacyGate(
    {
      id: "doc-secret-path",
      projectId: "project-a",
      type: "document",
      title: "Credential Notes",
      visibility: "ai-eligible",
      sourcePath: "private/api.md",
      content: "Credential handling notes."
    },
    DEFAULT_PRIVACY_POLICY
  );

  assert.equal(neverSendPath.allowed, false);
  assert.equal(neverSendPath.excluded?.reason, "never-send");
});

test("applyPrivacyGate blocks high-risk secrets when configured", () => {
  const decision = applyPrivacyGate(
    {
      id: "doc-secret",
      projectId: "project-a",
      type: "document",
      title: "Secret Note",
      visibility: "ai-eligible",
      sourcePath: "docs/secret-note.md",
      content: "api_key=supersecretvalue"
    },
    DEFAULT_PRIVACY_POLICY
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.excluded?.reason, "secret-detected");
  assert.equal(decision.safetyStatus, "blocked");
  assert.equal(decision.content, "");
});

test("applyPrivacyGate redacts secrets when high-risk blocking is disabled", () => {
  const decision = applyPrivacyGate(
    {
      id: "doc-redact",
      projectId: "project-a",
      type: "document",
      title: "Connection Note",
      visibility: "ai-eligible",
      sourcePath: "docs/connection.md",
      content: "Use password=supersecretvalue and operator:anothersecret@example.com for examples."
    },
    {
      ...DEFAULT_PRIVACY_POLICY,
      blockOnHighRiskSecrets: false
    }
  );

  assert.equal(decision.allowed, true);
  assert.equal(decision.safetyStatus, "needs-review");
  assert.match(decision.content, /\[REDACTED_CREDENTIAL\]/);
  assert.match(decision.content, /\[REDACTED_BASIC_AUTH_URL\]/);
  assert.equal(decision.content.includes("supersecretvalue"), false);
  assert.equal(decision.content.includes("anothersecret"), false);
  assert.deepEqual(
    decision.redactions.map((redaction) => redaction.itemId),
    ["doc-redact", "doc-redact"]
  );
});

test("combineSafetyStatus preserves the highest-risk status", () => {
  assert.equal(combineSafetyStatus(["clean", "needs-review"]), "needs-review");
  assert.equal(combineSafetyStatus(["clean", "index-stale", "needs-review"]), "index-stale");
  assert.equal(combineSafetyStatus(["clean", "blocked", "index-stale"]), "blocked");
  assert.equal(combineSafetyStatus([]), "clean");
});
