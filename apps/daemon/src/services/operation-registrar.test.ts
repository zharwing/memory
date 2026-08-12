import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { operationsForAudience, rpcOk, type OperationName } from "@zharwing/memory-core";
import { AuthorityService, type AuthorityClock, type AuthorityIds } from "./authority-service.js";
import { OperationEffectJournal } from "./effect-journal.js";
import { OperationRegistrar, type OperationAdmissionContext } from "./operation-registrar.js";

function fixture(t: TestContext) {
  let now = Date.parse("2026-08-12T12:00:00.000Z");
  let sequence = 0;
  const clock: AuthorityClock = { now: () => now };
  const ids: AuthorityIds = { create: (prefix) => `${prefix}:fixture-${++sequence}` };
  const authority = new AuthorityService(clock, ids, 2);
  let claimSequence = 0;
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zharwing-effect-registrar-"));
  t.after(() => fs.rmSync(stateRoot, { recursive: true, force: true }));
  const journalKey = Buffer.alloc(32, 6);
  const namespace = "a".repeat(64);
  const registrar = new OperationRegistrar(authority, clock, {
    effectJournal: new OperationEffectJournal({
      stateRoot,
      key: journalKey,
      namespace,
      maximumIdentities: 8,
      now: () => new Date(now)
    }),
    createClaimId: () => `claim-${++claimSequence}`
  });
  return {
    authority,
    registrar,
    clock,
    ids,
    stateRoot,
    journalKey,
    namespace,
    nextClaimId: () => `restart-claim-${++claimSequence}`,
    advance(milliseconds: number) { now += milliseconds; }
  };
}

function principal(
  authority: AuthorityService,
  audience: "browser" | "agent" | "admin",
  operations: readonly OperationName[],
  projectId: string | null = "project-a"
) {
  return authority.issuePrincipal({
    principalId: `${audience}-principal`,
    sessionOwner: `${audience}-owner`,
    audience,
    operations,
    projectId,
    ttlMs: 10_000
  });
}

function context(
  authority: AuthorityService,
  overrides: Partial<OperationAdmissionContext> = {}
): OperationAdmissionContext {
  return {
    endpoint: "/rpc",
    httpMethod: "POST",
    host: "127.0.0.1:37841",
    principal: principal(authority, "admin", ["memory.list_docs"]),
    csrfValidated: false,
    ...overrides
  };
}

test("registrar fails closed for endpoint audience allowlist project and transport mismatches", (t) => {
  const { authority, registrar } = fixture(t);
  const agent = principal(authority, "agent", ["memory.search"]);
  const browser = principal(authority, "browser", ["memory.list_docs"]);

  assert.equal(registrar.authorize(context(authority, { principal: agent }), {
    version: 1, id: 1, method: "memory.search", params: { projectId: "project-a", query: "fixture" }
  }).ok, false, "agent cannot bypass through raw /rpc");

  assert.equal(registrar.authorize(context(authority, { endpoint: "/agent-rpc", principal: agent }), {
    version: 1, id: 2, method: "memory.search", params: { projectId: "project-a", query: "fixture" }
  }).ok, true);

  assert.equal(registrar.authorize(context(authority), {
    version: 1, id: 3, method: "memory.list_docs", params: { projectId: "project-b" }
  }).ok, false);
  assert.equal(registrar.authorize(context(authority), {
    version: 1, id: 4, method: "memory.search", params: { projectId: "project-a", query: "fixture" }
  }).ok, false, "principal operation set is exact");
  assert.equal(registrar.authorize(context(authority, { httpMethod: "GET" }), {
    version: 1, id: 5, method: "memory.list_docs", params: { projectId: "project-a" }
  }).ok, false);
  assert.equal(registrar.authorize(context(authority, { host: "evil.example" }), {
    version: 1, id: 6, method: "memory.list_docs", params: { projectId: "project-a" }
  }).ok, false);
  assert.equal(registrar.authorize(context(authority, {
    principal: browser,
    origin: "http://127.0.0.1:5173",
    csrfValidated: false
  }), {
    version: 1, id: 7, method: "memory.list_docs", params: { projectId: "project-a" }
  }).ok, false);
  assert.equal(registrar.authorize(context(authority, { origin: "http://127.0.0.1:5173" }), {
    version: 1, id: 8, method: "memory.list_docs", params: { projectId: "project-a" }
  }).ok, false, "a browser Origin cannot exercise an admin bearer");
});

test("browser admission cannot reach global control or trash authority", (t) => {
  const { authority, registrar } = fixture(t);
  const browser = principal(
    authority,
    "browser",
    operationsForAudience("browser"),
    null
  );
  const browserContext = context(authority, {
    principal: browser,
    origin: "http://127.0.0.1:5173",
    csrfValidated: true
  });
  for (const method of [
    "memory.mcp_doctor",
    "memory.mcp_install",
    "memory.list_trash",
    "memory.restore_trash_item",
    "memory.purge_trash_item",
    "memory.empty_trash"
  ] as const) {
    assert.equal(
      registrar.authorize(browserContext, { version: 1, method, params: {} }).ok,
      false,
      `${method} must remain outside browser authority`
    );
  }
});

test("registrar validates registry input exactly once before dispatch", (t) => {
  const { authority, registrar } = fixture(t);
  const accepted = registrar.authorize(context(authority), {
    version: 1,
    id: 1,
    method: "memory.list_docs",
    params: { projectId: "project-a" }
  });
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.deepEqual(accepted.invocation.input, { projectId: "project-a" });

  const malformed = registrar.authorize(context(authority), {
    version: 1,
    id: 2,
    method: "memory.list_docs",
    params: { projectId: 42 }
  });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(
      malformed.error.code,
      "forbidden",
      "an invalid required project binding is refused before full parameter decoding"
    );
  }
});

test("hardened admission requires the exact compatibility version", (t) => {
  const { authority, registrar } = fixture(t);
  const base = { id: 1, method: "memory.list_docs", params: { projectId: "project-a" } };
  assert.equal(registrar.authorize(context(authority), base).ok, false);
  assert.equal(registrar.authorize(context(authority), { ...base, version: 2 }).ok, false);
  assert.equal(registrar.authorize(context(authority), { ...base, version: 1 }).ok, true);
});

test("audience-specific project scope makes agent and browser startup exact-project only", (t) => {
  const { authority, registrar } = fixture(t);
  const agent = principal(authority, "agent", ["memory.get_startup_state"]);
  const agentContext = context(authority, { endpoint: "/agent-rpc", principal: agent });
  assert.equal(registrar.authorize(agentContext, {
    version: 1,
    id: 1,
    method: "memory.get_startup_state",
    params: { workingDirectory: "D:/untrusted-discovery" }
  }).ok, false);
  assert.equal(registrar.authorize(agentContext, {
    version: 1,
    id: 2,
    method: "memory.get_startup_state",
    params: { projectId: "project-a" }
  }).ok, true);

  const unboundBrowser = principal(
    authority,
    "browser",
    ["memory.get_startup_state"],
    null
  );
  const browserContext = context(authority, {
    principal: unboundBrowser,
    origin: "http://127.0.0.1:5173",
    csrfValidated: true
  });
  assert.equal(registrar.authorize(browserContext, {
    version: 1,
    id: 3,
    method: "memory.get_startup_state",
    params: { projectId: "project-a" }
  }).ok, false);
  assert.equal(registrar.authorize(browserContext, {
    version: 1,
    id: 4,
    method: "memory.get_startup_state",
    params: { workingDirectory: "D:/untrusted-discovery" }
  }).ok, false);
});

test("consequential operations journal exact results without replaying stale agent projections", (t) => {
  const {
    authority,
    registrar,
    clock,
    ids,
    stateRoot,
    journalKey,
    namespace,
    nextClaimId
  } = fixture(t);
  const agent = principal(authority, "agent", ["memory.save_checkpoint"]);
  const baseContext = context(authority, {
    endpoint: "/agent-rpc",
    principal: agent,
    idempotencyKey: "checkpoint:fixture-1",
    projectGeneration: "b".repeat(64)
  });
  const request = {
    version: 1,
    id: 1,
    method: "memory.save_checkpoint",
    params: { projectId: "project-a", sessionId: "session-a", summary: "fixture" }
  };

  const first = registrar.authorize(baseContext, request);
  assert.equal(first.ok, true);
  const inFlightReplay = registrar.authorize(baseContext, request);
  assert.equal(inFlightReplay.ok, true);

  if (!first.ok) throw new Error("expected authorized invocation");
  if (!inFlightReplay.ok) throw new Error("expected in-flight reconciliation");
  assert.equal(first.invocation.domainEffect?.mode, "apply");
  assert.equal(inFlightReplay.invocation.domainEffect?.mode, "reconcile");
  assert.equal(
    inFlightReplay.invocation.domainEffect?.effectId,
    first.invocation.domainEffect?.effectId
  );
  const response = rpcOk(1, { status: "stored" });
  registrar.complete(first.invocation, response);
  const replay = registrar.authorize(baseContext, request);
  assert.equal(replay.ok, true);
  if (!replay.ok) throw new Error("expected completed-effect reconciliation");
  assert.equal(replay.invocation.domainEffect?.mode, "reconcile");

  const rotatedPrincipal = principal(authority, "agent", ["memory.save_checkpoint"]);
  const afterRotation = registrar.authorize(
    { ...baseContext, principal: rotatedPrincipal },
    { ...request, id: 9 }
  );
  assert.equal(afterRotation.ok, true, "credential rotation keeps the same logical effect identity");
  if (!afterRotation.ok) throw new Error("expected rotated-principal reconciliation");
  assert.equal(afterRotation.invocation.domainEffect?.mode, "reconcile");

  const conflicting = registrar.authorize(baseContext, {
    ...request,
    params: { ...request.params, summary: "different" }
  });
  assert.equal(conflicting.ok, false);
  if (!conflicting.ok) assert.equal(conflicting.error.code, "conflict");

  const missingRequiredKey = registrar.authorize(
    { ...baseContext, idempotencyKey: undefined },
    { ...request, id: 2 }
  );
  assert.equal(missingRequiredKey.ok, false, "registry-required effects fail closed without a key");
  if (!missingRequiredKey.ok) assert.equal(missingRequiredKey.error.code, "validation");

  const admin = principal(authority, "admin", ["memory.delete_doc"]);
  const adminContext = context(authority, {
    principal: admin,
    idempotencyKey: "document-delete:fixture-1",
    projectGeneration: "b".repeat(64)
  });
  const adminRequest = {
    version: 1,
    id: 20,
    method: "memory.delete_doc",
    params: { projectId: "project-a", documentId: "doc-a" }
  };
  const adminFirst = registrar.authorize(adminContext, adminRequest);
  assert.equal(adminFirst.ok, true);
  if (!adminFirst.ok) throw new Error("expected admin effect claim");
  const adminResponse = rpcOk(20, { status: "deleted" });
  registrar.complete(adminFirst.invocation, adminResponse);
  const adminReplay = registrar.authorize(adminContext, { ...adminRequest, id: 21 });
  assert.equal(adminReplay.ok, false, "even privileged results are receipts, not durable response bytes");
  if (!adminReplay.ok) assert.equal(adminReplay.error.code, "outcome_unknown");

  const inFlightContext = { ...baseContext, idempotencyKey: "checkpoint:inflight-restart" };
  const inFlight = registrar.authorize(inFlightContext, { ...request, id: 30 });
  assert.equal(inFlight.ok, true);

  const restartedAuthority = new AuthorityService(clock, ids, 19);
  const restartedAgent = principal(restartedAuthority, "agent", ["memory.save_checkpoint"]);
  const restartedRegistrar = new OperationRegistrar(restartedAuthority, clock, {
    effectJournal: new OperationEffectJournal({
      stateRoot,
      key: journalKey,
      namespace,
      maximumIdentities: 8,
      now: () => new Date(clock.now())
    }),
    createClaimId: nextClaimId
  });
  const restartedContext = {
    ...baseContext,
    principal: restartedAgent
  };
  const completedAfterRestart = restartedRegistrar.authorize(restartedContext, { ...request, id: 31 });
  assert.equal(completedAfterRestart.ok, true, "daemon restart retains the completed receipt");
  if (!completedAfterRestart.ok) throw new Error("expected restart reconciliation");
  assert.equal(completedAfterRestart.invocation.domainEffect?.mode, "reconcile");

  const inFlightAfterRestart = restartedRegistrar.authorize(
    { ...restartedContext, idempotencyKey: "checkpoint:inflight-restart" },
    { ...request, id: 32 }
  );
  assert.equal(inFlightAfterRestart.ok, true, "daemon restart retains an uncertain in-flight effect");
  if (!inFlightAfterRestart.ok) throw new Error("expected in-flight restart reconciliation");
  assert.equal(inFlightAfterRestart.invocation.domainEffect?.mode, "reconcile");

  const conflictAfterRestart = restartedRegistrar.authorize(restartedContext, {
    ...request,
    id: 33,
    params: { ...request.params, summary: "different after restart" }
  });
  assert.equal(conflictAfterRestart.ok, false);
  if (!conflictAfterRestart.ok) assert.equal(conflictAfterRestart.error.code, "conflict");

  restartedAuthority.advanceAuthorityEpoch();
  const stalePolicyReplay = restartedRegistrar.authorize(restartedContext, { ...request, id: 34 });
  assert.equal(stalePolicyReplay.ok, false, "current authority policy is checked before journal state");
  if (!stalePolicyReplay.ok) assert.equal(stalePolicyReplay.error.code, "unauthorized");
});

test("expired revoked and epoch-stale principals cannot authorize", (t) => {
  const { authority, registrar, advance } = fixture(t);
  const expiring = principal(authority, "admin", ["memory.list_docs"]);
  const request = { version: 1, method: "memory.list_docs", params: { projectId: "project-a" } };
  authority.revokeSession(expiring.sessionId);
  assert.equal(registrar.authorize(context(authority, { principal: expiring }), request).ok, false);

  const epochStale = principal(authority, "admin", ["memory.list_docs"]);
  authority.advanceAuthorityEpoch();
  assert.equal(registrar.authorize(context(authority, { principal: epochStale }), request).ok, false);

  const expired = principal(authority, "admin", ["memory.list_docs"]);
  advance(10_000);
  assert.equal(registrar.authorize(context(authority, { principal: expired }), request).ok, false);
});
