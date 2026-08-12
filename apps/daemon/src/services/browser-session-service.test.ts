import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthorityService, type AuthorityClock, type AuthorityIds } from "./authority-service.js";
import { BROWSER_SESSION_COOKIE, BrowserSessionService } from "./browser-session-service.js";

function fixture() {
  let now = Date.parse("2026-08-12T12:00:00.000Z");
  let idSequence = 0;
  let secretSequence = 0;
  const clock: AuthorityClock = { now: () => now };
  const ids: AuthorityIds = { create: (prefix) => `${prefix}:fixture-${++idSequence}` };
  const authority = new AuthorityService(clock, ids, 3);
  const sessions = new BrowserSessionService(
    authority,
    clock,
    { create: () => `opaque-fixture-secret-${String(++secretSequence).padStart(16, "0")}` },
    { bootstrapTtlMs: 1_000, sessionTtlMs: 5_000 }
  );
  return {
    authority,
    sessions,
    advance(milliseconds: number) { now += milliseconds; }
  };
}

const origin = "http://127.0.0.1:5173";
const host = "127.0.0.1:37841";
const grant = {
  principalId: "browser-principal",
  sessionOwner: "browser-owner",
  operations: ["memory.list_docs" as const],
  projectId: "project-a",
  allowedProjectIds: ["project-a", "project-b"]
};

test("bootstrap is digest-only, exact-origin-bound, and single-use", () => {
  const { sessions } = fixture();
  const bootstrap = sessions.issueBootstrap(origin, host, grant);

  assert.equal(sessions.consumeBootstrap(bootstrap.code, "http://localhost:5173", host), undefined);
  assert.equal(sessions.consumeBootstrap(bootstrap.code, origin, host), undefined, "a refused presentation still consumes the code");

  const second = sessions.issueBootstrap(origin, host, grant);
  const issue = sessions.consumeBootstrap(second.code, origin, host);
  assert.ok(issue);
  assert.equal(issue.principal.audience, "browser");
  assert.equal(issue.principal.projectId, "project-a");
  assert.equal(issue.rotationId, issue.principal.rotationId);
  assert.equal(sessions.consumeBootstrap(second.code, origin, host), undefined);
  assert.match(sessions.cookieHeader(issue), new RegExp(`^${BROWSER_SESSION_COOKIE}=`));
  assert.match(sessions.cookieHeader(issue), /HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(sessions.cookieHeader(issue), /; Secure/);
});

test("HTTPS-bound sessions emit Secure cookies", () => {
  const { sessions } = fixture();
  const httpsOrigin = "https://127.0.0.1:5173";
  const bootstrap = sessions.issueBootstrap(httpsOrigin, host, grant);
  const issue = sessions.consumeBootstrap(bootstrap.code, httpsOrigin, host)!;
  assert.match(sessions.cookieHeader(issue), /; Secure$/);
  assert.match(sessions.expiredCookieHeader(httpsOrigin), /; Secure$/);
});

test("cookie sessions require exact origin host and in-memory CSRF", () => {
  const { sessions } = fixture();
  const bootstrap = sessions.issueBootstrap(origin, host, grant);
  const issue = sessions.consumeBootstrap(bootstrap.code, origin, host)!;

  assert.equal(sessions.authenticate(issue.cookie, undefined, origin, host), undefined);
  assert.equal(sessions.authenticate(issue.cookie, "wrong-csrf-token".repeat(3), origin, host), undefined);
  assert.equal(sessions.authenticate(issue.cookie, issue.csrfToken, "http://localhost:5173", host), undefined);
  assert.equal(sessions.authenticate(issue.cookie, issue.csrfToken, origin, "localhost:37841"), undefined);
  assert.equal(sessions.authenticate(issue.cookie, issue.csrfToken, origin, host), issue.principal);
});

test("project switch rotates cookie CSRF and principal while revoking the old session", () => {
  const { sessions } = fixture();
  const bootstrap = sessions.issueBootstrap(origin, host, grant);
  const first = sessions.consumeBootstrap(bootstrap.code, origin, host)!;

  assert.equal(sessions.switchProject(first.cookie, first.csrfToken, origin, host, "project-c"), undefined);
  const second = sessions.switchProject(first.cookie, first.csrfToken, origin, host, "project-b")!;
  assert.equal(second.principal.projectId, "project-b");
  assert.notEqual(second.cookie, first.cookie);
  assert.notEqual(second.csrfToken, first.csrfToken);
  assert.equal(sessions.authenticate(first.cookie, first.csrfToken, origin, host), undefined);
  assert.equal(sessions.authenticate(second.cookie, second.csrfToken, origin, host), second.principal);
});

test("global first-run session gains only its decoded created project before binding", () => {
  const { sessions } = fixture();
  const bootstrap = sessions.issueBootstrap(origin, host, {
    principalId: "first-run-browser",
    sessionOwner: "first-run-owner",
    operations: ["memory.list_projects", "memory.create_project"],
    projectId: null,
    allowedProjectIds: []
  });
  const global = sessions.consumeBootstrap(bootstrap.code, origin, host)!;
  assert.equal(global.principal.projectId, null);
  assert.equal(
    sessions.switchProject(global.cookie, global.csrfToken, origin, host, "existing-project"),
    undefined,
    "knowledge of a project id does not grant authority"
  );
  assert.equal(sessions.allowCreatedProject(global.principal, "created-project"), true);
  const bound = sessions.switchProject(
    global.cookie,
    global.csrfToken,
    origin,
    host,
    "created-project"
  )!;
  assert.equal(bound.principal.projectId, "created-project");
});

test("global sessions may carry an explicit project allowlist before selecting one", () => {
  const { sessions } = fixture();
  const bootstrap = sessions.issueBootstrap(origin, host, {
    ...grant,
    projectId: null
  });
  const global = sessions.consumeBootstrap(bootstrap.code, origin, host)!;
  const bound = sessions.switchProject(global.cookie, global.csrfToken, origin, host, "project-b")!;
  assert.equal(bound.principal.projectId, "project-b");
});

test("an unbound browser cannot claim an existing project from caller input", () => {
  const { sessions } = fixture();
  const unbound = sessions.issueBootstrap(origin, host, {
    ...grant,
    projectId: null,
    allowedProjectIds: []
  });
  const first = sessions.consumeBootstrap(unbound.code, origin, host)!;

  assert.equal(
    sessions.switchProject(first.cookie, first.csrfToken, origin, host, "existing-project"),
    undefined
  );
  assert.equal(sessions.allowCreatedProject(first.principal, "newly-created-project"), true);
  const second = sessions.switchProject(
    first.cookie,
    first.csrfToken,
    origin,
    host,
    "newly-created-project"
  );
  assert.equal(second?.principal.projectId, "newly-created-project");
});

test("bootstrap and browser sessions expire without revival", () => {
  const { sessions, advance } = fixture();
  const bootstrap = sessions.issueBootstrap(origin, host, grant);
  advance(1_000);
  assert.equal(sessions.consumeBootstrap(bootstrap.code, origin, host), undefined);

  const next = sessions.issueBootstrap(origin, host, grant);
  const issue = sessions.consumeBootstrap(next.code, origin, host)!;
  advance(5_000);
  assert.equal(sessions.authenticate(issue.cookie, issue.csrfToken, origin, host), undefined);
});
