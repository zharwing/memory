import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthorityService, type AuthorityClock, type AuthorityIds } from "./authority-service.js";

function fixture() {
  let now = Date.parse("2026-08-12T12:00:00.000Z");
  let sequence = 0;
  const clock: AuthorityClock = { now: () => now };
  const ids: AuthorityIds = { create: (prefix) => `${prefix}:fixture-${++sequence}` };
  const authority = new AuthorityService(clock, ids, 7);
  return {
    authority,
    advance(milliseconds: number) { now += milliseconds; }
  };
}

function grant(projectId = "project-a") {
  return {
    principalId: "principal-fixture",
    sessionOwner: "owner-fixture",
    audience: "agent" as const,
    operations: ["memory.search" as const],
    projectId,
    ttlMs: 10_000
  };
}

test("authority authenticates digest-only credentials and expires claims", () => {
  const { authority, advance } = fixture();
  const credential = "credential-a".repeat(4);
  const principal = authority.registerCredential(credential, grant());

  assert.equal(authority.authenticate(credential), principal);
  assert.equal(authority.authenticate("credential-b".repeat(4)), undefined);
  assert.equal(principal.authorityEpoch, 7);
  assert.equal(Object.isFrozen(principal), true);
  assert.equal(Object.isFrozen(principal.operations), true);

  advance(10_000);
  assert.equal(authority.authenticate(credential), undefined);
  assert.equal(authority.isCurrent(principal), false);
});

test("session, rotation, and epoch revocation all fail closed", () => {
  const { authority } = fixture();
  const firstCredential = "first-credential".repeat(3);
  const first = authority.registerCredential(firstCredential, grant());

  authority.revokeSession(first.sessionId);
  assert.equal(authority.authenticate(firstCredential), undefined);

  const secondCredential = "second-credential".repeat(3);
  const second = authority.registerCredential(secondCredential, grant());
  authority.revokeRotation(second.rotationId);
  assert.equal(authority.authenticate(secondCredential), undefined);

  const thirdCredential = "third-credential".repeat(3);
  const third = authority.registerCredential(thirdCredential, grant());
  authority.advanceAuthorityEpoch();
  assert.equal(authority.authenticate(thirdCredential), undefined);
  assert.equal(authority.isCurrent(third), false);
});

test("rotation atomically invalidates the old credential", () => {
  const { authority } = fixture();
  const oldCredential = "old-credential".repeat(3);
  const newCredential = "new-credential".repeat(3);
  authority.registerCredential(oldCredential, grant());

  const rotated = authority.rotateCredential(oldCredential, newCredential, grant("project-b"));
  assert.equal(authority.authenticate(oldCredential), undefined);
  assert.equal(authority.authenticate(newCredential), rotated);
  assert.equal(rotated.projectId, "project-b");
});
