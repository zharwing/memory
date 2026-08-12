import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedOperationPrincipal } from "@zharwing/memory-core";
import { DestructiveIntentService } from "./destructive-intent-service.js";

function principal(overrides: Partial<AuthenticatedOperationPrincipal> = {}): AuthenticatedOperationPrincipal {
  return {
    authenticated: true,
    principalId: "desktop-principal",
    sessionId: "desktop-session",
    sessionOwner: "native-host",
    audience: "desktop",
    operations: [
      "memory.prepare_destructive_intent",
      "memory.commit_destructive_intent",
      "memory.cancel_destructive_intent",
      "memory.delete_doc"
    ],
    projectId: "project-a",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-02T00:00:00.000Z",
    authorityEpoch: 7,
    policyDigest: "policy-a",
    rotationId: "rotation-a",
    revocationId: "revocation-a",
    ...overrides
  } as AuthenticatedOperationPrincipal;
}

test("destructive intents bind target, principal, acknowledgement, expiry, and one atomic winner", async () => {
  let now = Date.parse("2026-01-01T01:00:00.000Z");
  const service = new DestructiveIntentService(() => now);
  const prepared = service.prepare({
    projectId: "project-a",
    operation: "memory.delete_doc",
    input: { projectId: "project-a", documentId: "doc-a" }
  }, principal());
  let calls = 0;
  const result = await service.commit({
    projectId: "project-a",
    intentId: prepared.intentId,
    acknowledgement: prepared.acknowledgement
  }, principal(), async (operation, input) => {
    calls += 1;
    assert.equal(operation, "memory.delete_doc");
    assert.deepEqual(input, { projectId: "project-a", documentId: "doc-a" });
    return { id: "trash-a" };
  });
  assert.equal(result.status, "committed");
  assert.equal(calls, 1);
  await assert.rejects(() => service.commit({
    projectId: "project-a",
    intentId: prepared.intentId,
    acknowledgement: prepared.acknowledgement
  }, principal(), async () => {
    calls += 1;
  }), /already been consumed/);
  assert.equal(calls, 1);

  const rotated = service.prepare({
    projectId: "project-a",
    operation: "memory.delete_doc",
    input: { projectId: "project-a", documentId: "doc-b" }
  }, principal());
  await assert.rejects(() => service.commit({
    projectId: "project-a",
    intentId: rotated.intentId,
    acknowledgement: rotated.acknowledgement
  }, principal({ rotationId: "rotation-b" }), async () => undefined), /authority changed/);

  const revoked = service.prepare({
    projectId: "project-a",
    operation: "memory.delete_doc",
    input: { projectId: "project-a", documentId: "doc-revoked" }
  }, principal());
  await assert.rejects(() => service.commit({
    projectId: "project-a",
    intentId: revoked.intentId,
    acknowledgement: revoked.acknowledgement
  }, principal({ revocationId: "revocation-b" }), async () => undefined), /authority changed/);

  const expired = service.prepare({
    projectId: "project-a",
    operation: "memory.delete_doc",
    input: { projectId: "project-a", documentId: "doc-c" }
  }, principal());
  now += 3 * 60 * 1000;
  await assert.rejects(() => service.commit({
    projectId: "project-a",
    intentId: expired.intentId,
    acknowledgement: expired.acknowledgement
  }, principal(), async () => undefined), /expired/);
});

test("destructive intents reject cross-project targets and non-destructive operations", () => {
  const service = new DestructiveIntentService();
  assert.throws(() => service.prepare({
    projectId: "project-a",
    operation: "memory.delete_doc",
    input: { projectId: "project-b", documentId: "doc-b" }
  }, principal()), /project refused/);
  assert.throws(() => service.prepare({
    projectId: "project-a",
    operation: "memory.list_docs",
    input: { projectId: "project-a" }
  }, principal({ operations: ["memory.list_docs"] })), /not destructive/);
});
