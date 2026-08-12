import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrincipalClaims } from "../types.js";
import {
  evaluatePrincipalValidity,
  markPrincipalAuthenticated,
  parsePrincipalClaims,
  principalAllowsOperation,
  principalAllowsProject
} from "./principals.js";

const issuedAt = "2026-08-12T10:00:00.000Z";
const expiresAt = "2026-08-12T11:00:00.000Z";

function claims(overrides: Partial<PrincipalClaims> = {}): PrincipalClaims {
  return {
    principalId: "principal-1",
    sessionId: "session-1",
    sessionOwner: "local-user",
    audience: "agent",
    operations: ["memory.search"],
    projectId: "project-a",
    issuedAt,
    expiresAt,
    authorityEpoch: 7,
    policyDigest: "sha256:policy",
    rotationId: "rotation-2",
    revocationId: "revocation-1",
    ...overrides
  };
}

test("principal claims parse an exact registered, unique operation set", () => {
  const parsed = parsePrincipalClaims(claims());
  assert.deepEqual(parsed.operations, ["memory.search"]);
  assert.throws(() => parsePrincipalClaims(claims({ operations: ["memory.unknown"] })), /registered operation/);
  assert.throws(
    () => parsePrincipalClaims(claims({ operations: ["memory.search", "memory.search"] })),
    /unique operation set/
  );
  assert.throws(() => parsePrincipalClaims(claims({ expiresAt: issuedAt })), /after issuedAt/);
});

test("principal validity rejects expiry, epoch drift, revocation, and superseded rotation", () => {
  const principal = claims();
  const base = {
    now: Date.parse("2026-08-12T10:30:00.000Z"),
    authorityEpoch: 7
  };
  assert.deepEqual(evaluatePrincipalValidity(principal, base), { valid: true });
  assert.deepEqual(evaluatePrincipalValidity(principal, { ...base, now: Date.parse(expiresAt) }), {
    valid: false,
    reason: "expired"
  });
  assert.deepEqual(evaluatePrincipalValidity(principal, { ...base, authorityEpoch: 8 }), {
    valid: false,
    reason: "authority-epoch-mismatch"
  });
  assert.deepEqual(evaluatePrincipalValidity(principal, {
    ...base,
    revokedRevocationIds: new Set(["revocation-1"])
  }), { valid: false, reason: "revocation-id-revoked" });
  assert.deepEqual(evaluatePrincipalValidity(principal, {
    ...base,
    activeRotationIds: new Set(["rotation-3"])
  }), { valid: false, reason: "rotation-superseded" });
});

test("operation and project authorization are both exact", () => {
  const principal = claims();
  assert.equal(principalAllowsOperation(principal, "memory.search"), true);
  assert.equal(principalAllowsOperation(principal, "memory.list_docs"), false);
  assert.equal(principalAllowsProject(principal, "project-a", "required"), true);
  assert.equal(principalAllowsProject(principal, "project-b", "required"), false);
  assert.equal(principalAllowsProject(principal, undefined, "required"), false);
  assert.equal(principalAllowsProject(principal, undefined, "none"), true);
  assert.equal(principalAllowsProject({ ...principal, projectId: null }, "project-a", "none"), false);
});

test("authenticated claims are frozen with an immutable operation set", () => {
  const authenticated = markPrincipalAuthenticated(claims());
  assert.equal(authenticated.authenticated, true);
  assert.equal(Object.isFrozen(authenticated), true);
  assert.equal(Object.isFrozen(authenticated.operations), true);
});
