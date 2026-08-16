import assert from "node:assert/strict";
import { mkdtempSync, promises as fs, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import {
  AGENT_OPERATIONS,
  createPublicError,
  operationsForAudience,
  type OperationName,
  type RpcRequest
} from "@zharwing/memory-core";
import { resolveAuthToken, tokenFilePath, type DaemonConfig } from "./config.js";
import {
  createDaemonAdmissionServices,
  createDaemonServer,
  issueBrowserBootstrap,
  registerAgentCredential,
  MAX_REQUEST_BODY_BYTES,
  type DaemonAdmissionServices
} from "./server.js";
import { MemoryService } from "./memory-service.js";
import {
  AuthorityService,
  type AuthorityClock,
  type AuthorityIds
} from "./services/authority-service.js";
import { BrowserSessionService } from "./services/browser-session-service.js";
import { OperationEffectJournal } from "./services/effect-journal.js";
import {
  OperationRegistrar,
  type AdmissionResult,
  type OperationAdmissionContext
} from "./services/operation-registrar.js";

const TEST_TOKEN = "a".repeat(64);

function testConfig(overrides: Partial<DaemonConfig> = {}): DaemonConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    profile: "personal-preview",
    authMode: "token",
    authToken: TEST_TOKEN,
    memoryRoot: "/tmp/zharwing-test-root",
    agentSurfaceEnabled: false,
    ...overrides
  };
}

async function startServer(t: TestContext, config: DaemonConfig): Promise<string> {
  const server = createDaemonServer(config, {} as MemoryService);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected TCP address");
  return `http://127.0.0.1:${address.port}`;
}

interface AdmissionObservation {
  readonly requestId?: string | number;
  readonly operation: string;
  readonly contextIdempotencyKey?: string;
  readonly invocationIdempotencyKey?: string;
  readonly admitted: boolean;
  readonly errorCode?: string;
  readonly inputHasCallerIdempotencyKey: boolean;
  readonly invocationProjectId?: string;
}

class CapturingOperationRegistrar extends OperationRegistrar {
  constructor(
    authority: AuthorityService,
    clock: AuthorityClock,
    private readonly observations: AdmissionObservation[],
    createClaimId: () => string,
    effectJournal: OperationEffectJournal
  ) {
    super(authority, clock, { createClaimId, effectJournal });
  }

  override authorize(
    context: OperationAdmissionContext,
    request: RpcRequest
  ): AdmissionResult {
    const result = super.authorize(context, request);
    this.observations.push({
      ...(request.id !== undefined ? { requestId: request.id } : {}),
      operation: request.method,
      ...(context.idempotencyKey ? {
        contextIdempotencyKey: context.idempotencyKey
      } : {}),
      ...(result.ok && result.invocation.idempotencyKey ? {
        invocationIdempotencyKey: result.invocation.idempotencyKey
      } : {}),
      admitted: result.ok,
      ...(result.ok && result.invocation.projectId ? {
        invocationProjectId: result.invocation.projectId
      } : {}),
      ...(!result.ok ? { errorCode: result.error.code } : {}),
      inputHasCallerIdempotencyKey: Boolean(
        request.params &&
        typeof request.params === "object" &&
        !Array.isArray(request.params) &&
        Object.prototype.hasOwnProperty.call(request.params, "idempotencyKey")
      )
    });
    if (result.ok) this.abandon(result.invocation);
    // Stop before service dispatch; this test registrar observes the real
    // admission decision and then returns a synthetic closed refusal.
    return { ok: false, status: 403, error: createPublicError("forbidden") };
  }
}

function deterministicAdmission(
  t: TestContext,
  observations?: AdmissionObservation[]
): DaemonAdmissionServices {
  const clock: AuthorityClock = { now: () => Date.parse("2026-08-12T12:00:00.000Z") };
  let idSequence = 0;
  let secretSequence = 0;
  const ids: AuthorityIds = { create: (prefix) => `${prefix}:http-${++idSequence}` };
  const authority = new AuthorityService(clock, ids, 7);
  const browserSessions = new BrowserSessionService(
    authority,
    clock,
    { create: () => `http-secret-${String(++secretSequence).padStart(32, "0")}` }
  );
  const effectStateRoot = mkdtempSync(path.join(os.tmpdir(), "zharwing-server-effects-"));
  t.after(() => rmSync(effectStateRoot, { recursive: true, force: true }));
  const effectJournal = new OperationEffectJournal({
    stateRoot: effectStateRoot,
    key: Buffer.alloc(32, 8),
    namespace: "e".repeat(64),
    now: () => new Date(clock.now())
  });
  return {
    authority,
    browserSessions,
    registrar: observations
      ? new CapturingOperationRegistrar(
          authority,
          clock,
          observations,
          () => `http-claim-${++idSequence}`,
          effectJournal
        )
      : new OperationRegistrar(authority, clock, {
          effectJournal,
          createClaimId: () => `http-claim-${++idSequence}`
        })
  };
}

async function startComposedServer(
  t: TestContext,
  config: DaemonConfig,
  admission: DaemonAdmissionServices
): Promise<{ base: string; host: string }> {
  const service = {
    memoryRoot: () => "/synthetic/memory-root",
    listProjects: async () => [{ id: "preview-project" }],
    getProjectGeneration: async () => "f".repeat(64),
    detectProject: async ({ workingDirectory }: { workingDirectory: string }) => ({
      workingDirectory,
      repoRoot: workingDirectory,
      ...(workingDirectory === "D:/agent-project-a" ? { projectId: "project-a" } :
        workingDirectory === "D:/agent-project-b" ? { projectId: "project-b" } : {}),
      projectStatus: workingDirectory === "D:/agent-project-a" || workingDirectory === "D:/agent-project-b"
        ? "resolved"
        : "unregistered",
      message: "Synthetic project detection."
    }),
    withDomainEffect: async (_effect: unknown, task: () => Promise<unknown>) => task()
  } as unknown as MemoryService;
  const server = createDaemonServer(config, { service, admission });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected TCP address");
  const host = `127.0.0.1:${address.port}`;
  return { base: `http://${host}`, host };
}

async function startRealComposedServer(
  t: TestContext,
  config: DaemonConfig,
  service: MemoryService,
  admission: DaemonAdmissionServices
): Promise<{ base: string; host: string }> {
  const server = createDaemonServer(config, { service, admission });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected TCP address");
  const host = `127.0.0.1:${address.port}`;
  return { base: `http://${host}`, host };
}

interface SimpleResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function request(url: string, options: http.RequestOptions & { body?: string } = {}): Promise<SimpleResponse> {
  return new Promise((resolve, reject) => {
    const { body, ...requestOptions } = options;
    const req = http.request(url, requestOptions, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function sessionCookie(response: SimpleResponse): string {
  const header = response.headers["set-cookie"]?.[0];
  if (!header) throw new Error("Expected browser session cookie");
  return header.split(";", 1)[0]!;
}

test("rpc requests without a token are rejected with 401", async (t) => {
  const base = await startServer(t, testConfig());
  const response = await request(`${base}/rpc`, {
    method: "POST",
    body: JSON.stringify({ id: 1, method: "memory.health" })
  });
  assert.equal(response.status, 401);
  assert.deepEqual(JSON.parse(response.body), {
    version: 1,
    ok: false,
    error: createPublicError("unauthorized")
  });
});

test("rpc requests with the configured token pass authorization", async (t) => {
  const base = await startServer(t, testConfig());
  const response = await request(`${base}/rpc`, {
    method: "POST",
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    body: JSON.stringify({ id: 1, method: "memory.unknown_method" })
  });
  assert.notEqual(response.status, 401);
});

test("personal-preview configured admin token retains legacy project operations", async (t) => {
  const memoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-preview-admin-"));
  t.after(() => fs.rm(memoryRoot, { recursive: true, force: true }));
  const service = new MemoryService({
    memoryRoot,
    authorityStateRoot: path.join(memoryRoot, "authority-test"),
    authorityKey: Buffer.alloc(32, 9)
  });
  const preview = await service.prepareProjectCreation({ projectName: "Preview Admin", createPointerFile: false });
  const project = await service.createProject({ preview });
  const config = testConfig({ memoryRoot });
  const server = createDaemonServer(config, service);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected preview address.");
  const response = await request(`http://127.0.0.1:${address.port}/rpc`, {
    method: "POST",
    headers: { authorization: `Bearer ${TEST_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ version: 1, id: 1, method: "memory.get_project", params: { projectId: project.id } })
  });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).result.id, project.id);
});

test("personal-preview versionless failures expose only fixed compatibility copy", async (t) => {
  const base = await startServer(t, testConfig());
  const response = await request(`${base}/rpc`, {
    method: "POST",
    headers: { authorization: `Bearer ${TEST_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ id: "legacy-error", method: "PRIVATE_EXCEPTION_CANARY" })
  });
  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(response.body), {
    id: "legacy-error",
    ok: false,
    error: { message: "The memory service is not compatible with this app version." }
  });
  assert.doesNotMatch(response.body, /PRIVATE_EXCEPTION_CANARY|stack|cause|path/);
});

test("hostile origins are rejected and never reflected", async (t) => {
  const base = await startServer(t, testConfig());
  const response = await request(`${base}/health`, {
    headers: { origin: "https://evil.example" }
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
});

test("loopback origins receive CORS headers", async (t) => {
  const base = await startServer(t, testConfig());
  const response = await request(`${base}/health`, {
    headers: { origin: "http://127.0.0.1:5173" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers["access-control-allow-origin"], "http://127.0.0.1:5173");
});

test("non-loopback Host headers are rejected (DNS rebinding)", async (t) => {
  const base = await startServer(t, testConfig());
  const response = await request(`${base}/health`, {
    headers: { host: "evil.example:37841" }
  });
  assert.equal(response.status, 403);
});

test("invalid non-loopback and unauthenticated hardened composition fails before listen", () => {
  assert.throws(
    () => createDaemonServer(testConfig({ profile: "hardened-local", host: "0.0.0.0" })),
    /exact loopback host/
  );
  assert.throws(
    () => createDaemonServer(testConfig({
      profile: "hardened-local",
      authMode: "none",
      authToken: ""
    })),
    /token\/session authentication/
  );
  assert.throws(
    () => createDaemonServer(testConfig({ host: "0.0.0.0", authMode: "none", authToken: "" })),
    /exact loopback host/
  );
});

test("health output is minimal: no memory root path, no auth mode", async (t) => {
  const base = await startServer(t, testConfig());
  const response = await request(`${base}/health`);
  assert.equal(response.status, 200);
  const payload = JSON.parse(response.body) as Record<string, unknown>;
  assert.deepEqual(payload, { status: "ok" });
  assert.ok(!response.body.includes("zharwing-test-root"));
});

test("oversized request bodies are rejected with 413", async (t) => {
  const base = await startServer(t, testConfig());
  const response = await request(`${base}/rpc`, {
    method: "POST",
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    body: "x".repeat(MAX_REQUEST_BODY_BYTES + 1024)
  }).catch(() => ({ status: 413, headers: {}, body: "" }));
  assert.equal(response.status, 413);
});

test("mcp surface is disabled by default with a typed error", async (t) => {
  const base = await startServer(t, testConfig());
  const response = await request(`${base}/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
  });
  assert.equal(response.status, 403);
  assert.equal(
    (JSON.parse(response.body) as { error: { code: string } }).error.code,
    "forbidden"
  );
});

test("hardened browser bootstrap is single-use and all domain POSTs use cookie CSRF admission", async (t) => {
  const admission = deterministicAdmission(t);
  const { base, host } = await startComposedServer(
    t,
    testConfig({ profile: "hardened-local" }),
    admission
  );
  const origin = "http://127.0.0.1:5173";
  const bootstrap = issueBrowserBootstrap(admission, origin, host, {
    principalId: "http-browser",
    sessionOwner: "http-test",
    operations: ["memory.health"],
    projectId: null,
    allowedProjectIds: []
  });
  const exchanged = await request(`${base}/browser-session/bootstrap`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ code: bootstrap.code })
  });
  assert.equal(exchanged.status, 200);
  assert.match(exchanged.headers["set-cookie"]?.[0] ?? "", /HttpOnly; SameSite=Strict/);
  const session = JSON.parse(exchanged.body) as Record<string, unknown>;
  assert.deepEqual(Object.keys(session).sort(), ["csrfToken", "expiresAt", "projectId", "rotationId"]);
  assert.equal(session.projectId, null);
  assert.ok(!exchanged.body.includes(bootstrap.code));

  const replay = await request(`${base}/browser-session/bootstrap`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ code: bootstrap.code })
  });
  assert.equal(replay.status, 401);

  const cookie = sessionCookie(exchanged);
  const admitted = await request(`${base}/rpc`, {
    method: "POST",
    headers: {
      origin,
      cookie,
      "content-type": "application/json",
      "x-csrf-token": String(session.csrfToken)
    },
    body: JSON.stringify({ version: 1, id: "health-1", method: "memory.health", params: {} })
  });
  assert.equal(admitted.status, 200);
  assert.equal((JSON.parse(admitted.body) as { ok: boolean }).ok, true);

  const missingCsrf = await request(`${base}/rpc`, {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ version: 1, id: 2, method: "memory.health", params: {} })
  });
  assert.equal(missingCsrf.status, 401);

  const missingVersion = await request(`${base}/rpc`, {
    method: "POST",
    headers: {
      origin,
      cookie,
      "content-type": "application/json",
      "x-csrf-token": String(session.csrfToken)
    },
    body: JSON.stringify({ id: 3, method: "memory.health", params: {} })
  });
  assert.equal(missingVersion.status, 400);

  for (const method of ["GET", "HEAD"]) {
    const inert = await request(`${base}/browser-session/bootstrap`, { method });
    assert.equal(inert.status, 404);
    assert.equal(inert.headers["set-cookie"], undefined);
  }
});

test("browser project bind rotate and revoke atomically replace session authority", async (t) => {
  const admission = deterministicAdmission(t);
  const { base, host } = await startComposedServer(
    t,
    testConfig({ profile: "hardened-local" }),
    admission
  );
  const origin = "http://127.0.0.1:5173";
  const bootstrap = issueBrowserBootstrap(admission, origin, host, {
    principalId: "http-browser",
    sessionOwner: "http-test",
    operations: ["memory.list_docs"],
    projectId: null,
    allowedProjectIds: ["project-a"]
  });
  const first = await request(`${base}/browser-session/bootstrap`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ code: bootstrap.code })
  });
  const firstBody = JSON.parse(first.body) as Record<string, unknown>;
  const firstCookie = sessionCookie(first);

  const bound = await request(`${base}/browser-session/project`, {
    method: "POST",
    headers: {
      origin,
      cookie: firstCookie,
      "content-type": "application/json",
      "x-csrf-token": String(firstBody.csrfToken)
    },
    body: JSON.stringify({ projectId: "project-a" })
  });
  assert.equal(bound.status, 200);
  const boundBody = JSON.parse(bound.body) as Record<string, unknown>;
  assert.equal(boundBody.projectId, "project-a");
  assert.notEqual(boundBody.rotationId, firstBody.rotationId);
  const boundCookie = sessionCookie(bound);

  const oldSession = await request(`${base}/rpc`, {
    method: "POST",
    headers: {
      origin,
      cookie: firstCookie,
      "content-type": "application/json",
      "x-csrf-token": String(firstBody.csrfToken)
    },
    body: JSON.stringify({ version: 1, method: "memory.list_docs", params: { projectId: "project-a" } })
  });
  assert.equal(oldSession.status, 401);

  const rotated = await request(`${base}/browser-session/rotate`, {
    method: "POST",
    headers: {
      origin,
      cookie: boundCookie,
      "content-type": "application/json",
      "x-csrf-token": String(boundBody.csrfToken)
    },
    body: "{}"
  });
  assert.equal(rotated.status, 200);
  const rotatedBody = JSON.parse(rotated.body) as Record<string, unknown>;
  const rotatedCookie = sessionCookie(rotated);
  assert.notEqual(rotatedBody.rotationId, boundBody.rotationId);

  const revoked = await request(`${base}/browser-session/revoke`, {
    method: "POST",
    headers: {
      origin,
      cookie: rotatedCookie,
      "content-type": "application/json",
      "x-csrf-token": String(rotatedBody.csrfToken)
    },
    body: "{}"
  });
  assert.equal(revoked.status, 204);
  assert.match(revoked.headers["set-cookie"]?.[0] ?? "", /Max-Age=0/);
});

test("personal preview has a bounded loopback authMode=none session path and token mode does not", async (t) => {
  const origin = "http://127.0.0.1:5173";
  const previewAdmission = deterministicAdmission(t);
  const preview = await startComposedServer(
    t,
    testConfig({ profile: "personal-preview", authMode: "none", authToken: "" }),
    previewAdmission
  );
  const established = await request(`${preview.base}/browser-session/preview`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(established.status, 200);
  const body = JSON.parse(established.body) as Record<string, unknown>;
  assert.equal(body.projectId, null);
  const rpc = await request(`${preview.base}/rpc`, {
    method: "POST",
    headers: {
      origin,
      cookie: sessionCookie(established),
      "content-type": "application/json",
      "x-csrf-token": String(body.csrfToken)
    },
    body: JSON.stringify({ version: 1, method: "memory.health", params: {} })
  });
  assert.equal(rpc.status, 200);

  const selected = await request(`${preview.base}/browser-session/project`, {
    method: "POST",
    headers: {
      origin,
      cookie: sessionCookie(established),
      "content-type": "application/json",
      "x-csrf-token": String(body.csrfToken)
    },
    body: JSON.stringify({ projectId: "preview-project" })
  });
  assert.equal(selected.status, 200);
  const selectedBody = JSON.parse(selected.body) as Record<string, unknown>;
  assert.equal(selectedBody.projectId, "preview-project");

  const secondTab = await request(`${preview.base}/browser-session/preview`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(secondTab.status, 200);
  const firstTabAfterSharedCookieChange = await request(`${preview.base}/browser-session/rotate`, {
    method: "POST",
    headers: {
      origin,
      cookie: sessionCookie(secondTab),
      "content-type": "application/json",
      "x-csrf-token": String(selectedBody.csrfToken)
    },
    body: "{}"
  });
  assert.equal(firstTabAfterSharedCookieChange.status, 200);
  assert.equal(JSON.parse(firstTabAfterSharedCookieChange.body).projectId, "preview-project");

  const tokenAdmission = deterministicAdmission(t);
  const tokenPreview = await startComposedServer(t, testConfig(), tokenAdmission);
  const refused = await request(`${tokenPreview.base}/browser-session/preview`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(refused.status, 404);

  const hardenedAdmission = deterministicAdmission(t);
  const hardened = await startComposedServer(
    t,
    testConfig({ profile: "hardened-local" }),
    hardenedAdmission
  );
  const hardenedRefusal = await request(`${hardened.base}/browser-session/preview`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(hardenedRefusal.status, 404);
});

test("browser RPC closes a large session with one compact bounded result", async (t) => {
  const memoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-browser-close-"));
  t.after(() => fs.rm(memoryRoot, { recursive: true, force: true }));
  const config = testConfig({
    profile: "personal-preview",
    authMode: "none",
    authToken: "",
    memoryRoot
  });
  const service = new MemoryService({ memoryRoot });
  t.after(() => service.dispose());
  let observedCompactClose = false;
  const closeSession = service.closeSession.bind(service);
  service.closeSession = async (params) => {
    observedCompactClose = params.compact === true;
    return closeSession(params);
  };
  const preview = await service.prepareProjectCreation({
    projectName: "Large Browser Close",
    createPointerFile: false
  });
  const project = await service.createProject({ preview });
  const active = await service.startSession({
    projectId: project.id,
    workingDirectory: memoryRoot,
    taskTitle: "Large browser session"
  });
  await service.saveCheckpoint({
    projectId: project.id,
    sessionId: active.id,
    summary: "x".repeat(2 * 1024 * 1024 + 4096)
  });

  const server = await startRealComposedServer(t, config, service, deterministicAdmission(t));
  const origin = "http://127.0.0.1:5173";
  const established = await request(`${server.base}/browser-session/preview`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(established.status, 200);
  const establishedBody = JSON.parse(established.body) as Record<string, unknown>;
  const selected = await request(`${server.base}/browser-session/project`, {
    method: "POST",
    headers: {
      origin,
      cookie: sessionCookie(established),
      "content-type": "application/json",
      "x-csrf-token": String(establishedBody.csrfToken)
    },
    body: JSON.stringify({ projectId: project.id })
  });
  assert.equal(selected.status, 200);
  const selectedBody = JSON.parse(selected.body) as Record<string, unknown>;
  const closed = await request(`${server.base}/rpc`, {
    method: "POST",
    headers: {
      origin,
      cookie: sessionCookie(selected),
      "content-type": "application/json",
      "x-csrf-token": String(selectedBody.csrfToken),
      "x-idempotency-key": "operation:browser-close-large-session"
    },
    body: JSON.stringify({
      id: "browser-close-large",
      version: 1,
      method: "memory.close_session",
      params: {
        projectId: project.id,
        sessionId: active.id,
        includeInGraph: true,
        compact: true,
        autoSummarize: false
      }
    })
  });

  assert.equal(closed.status, 200, closed.body);
  assert.equal(observedCompactClose, true, "browser RPC must forward compact close input");
  const rpc = JSON.parse(closed.body) as {
    ok: boolean;
    result?: Record<string, unknown>;
  };
  const responseBytes = Buffer.byteLength(closed.body, "utf8");
  assert.ok(
    responseBytes < 32 * 1024,
    `compact close returned ${responseBytes} bytes with keys ${Object.keys(rpc.result || {}).join(",")}`
  );
  assert.equal(rpc.ok, true);
  assert.equal(rpc.result?.status, "closed");
  assert.equal(rpc.result?.includeInGraph, true);
  assert.equal("body" in (rpc.result || {}), false);
  assert.equal("checkpoints" in (rpc.result || {}), false);
  assert.equal((await service.getLatestSession({ projectId: project.id }))?.status, "closed");
});

test("agent ingress accepts only a distinct project-bound agent credential", async (t) => {
  const admission = deterministicAdmission(t);
  const config = testConfig({ profile: "hardened-local", agentSurfaceEnabled: true });
  const { base } = await startComposedServer(t, config, admission);
  const agentCredential = "agent-http-credential-".padEnd(64, "x");
  const principal = registerAgentCredential(admission, {
    credential: agentCredential,
    principalId: "codex-agent",
    sessionOwner: "codex-test",
    projectId: "project-a",
    ttlMs: 10_000
  });
  assert.deepEqual([...principal.operations], [...AGENT_OPERATIONS]);

  const accepted = await request(`${base}/agent-rpc`, {
    method: "POST",
    headers: { authorization: `Bearer ${agentCredential}`, "content-type": "application/json" },
    body: JSON.stringify({ version: 1, id: 1, method: "memory.health", params: {} })
  });
  assert.equal(accepted.status, 200);
  assert.ok(!accepted.body.includes(agentCredential));

  const adminCredential = "admin-http-credential-".padEnd(64, "y");
  admission.authority.registerCredential(adminCredential, {
    principalId: "admin",
    sessionOwner: "admin-test",
    audience: "admin",
    operations: operationsForAudience("admin"),
    projectId: null,
    ttlMs: 10_000
  });
  const adminBypass = await request(`${base}/agent-rpc`, {
    method: "POST",
    headers: { authorization: `Bearer ${adminCredential}`, "content-type": "application/json" },
    body: JSON.stringify({ version: 1, method: "memory.health", params: {} })
  });
  assert.equal(adminBypass.status, 403);

  const unauthenticatedMcp = await request(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })
  });
  assert.equal(unauthenticatedMcp.status, 401);

  const admittedMcp = await request(`${base}/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${agentCredential}`, "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "memory.health", arguments: {} }
    })
  });
  assert.equal(admittedMcp.status, 200);
  assert.doesNotMatch(admittedMcp.body, /"error"/);

  const mcp = await request(`${base}/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${agentCredential}`, "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "memory.get_startup_state", arguments: { projectId: "project-b" } }
    })
  });
  assert.equal(mcp.status, 200);
  assert.equal(JSON.parse(mcp.body).error.code, -32603);
  assert.ok(!mcp.body.includes("project-b"));
});

test("agent startup omission binds only after working-directory project verification", async (t) => {
  const observations: AdmissionObservation[] = [];
  const admission = deterministicAdmission(t, observations);
  const config = testConfig({ profile: "hardened-local", agentSurfaceEnabled: true });
  const { base } = await startComposedServer(t, config, admission);
  const credential = "agent-startup-binding-credential-".padEnd(64, "s");
  registerAgentCredential(admission, {
    credential,
    principalId: "startup-agent",
    sessionOwner: "startup-test",
    projectId: "project-a",
    ttlMs: 10_000
  });
  const call = (id: number, method: string, params: Record<string, unknown>) => request(`${base}/agent-rpc`, {
    method: "POST",
    headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
    body: JSON.stringify({ version: 1, id, method, params })
  });

  await call(1, "memory.get_startup_state", {});
  await call(2, "memory.get_startup_state", { workingDirectory: "D:/agent-project-a" });
  await call(3, "memory.get_startup_state", { workingDirectory: "D:/agent-project-b" });
  await call(4, "memory.get_recent_sessions", {});
  await call(5, "memory.get_startup_state", { projectId: "project-b" });

  assert.deepEqual(observations.map((item) => ({
    operation: item.operation,
    admitted: item.admitted,
    projectId: item.invocationProjectId,
    error: item.errorCode
  })), [
    { operation: "memory.get_startup_state", admitted: true, projectId: "project-a", error: undefined },
    { operation: "memory.get_startup_state", admitted: true, projectId: "project-a", error: undefined },
    { operation: "memory.get_startup_state", admitted: false, projectId: undefined, error: "forbidden" },
    { operation: "memory.get_recent_sessions", admitted: false, projectId: undefined, error: "forbidden" },
    { operation: "memory.get_startup_state", admitted: false, projectId: undefined, error: "forbidden" }
  ]);
});

test("hardened MCP derives stable bounded mutation idempotency from each JSON-RPC identity", async (t) => {
  const observations: AdmissionObservation[] = [];
  const admission = deterministicAdmission(t, observations);
  const config = testConfig({ profile: "hardened-local", agentSurfaceEnabled: true });
  const { base } = await startComposedServer(t, config, admission);
  const credential = "agent-mcp-idempotency-credential-".padEnd(64, "i");
  registerAgentCredential(admission, {
    credential,
    principalId: "mcp-idempotency-agent",
    sessionOwner: "mcp-idempotency-test",
    projectId: "project-a",
    ttlMs: 10_000
  });

  const call = (
    payload: unknown,
    transportKey = "caller-transport-key"
  ) => request(`${base}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json",
      "x-idempotency-key": transportKey
    },
    body: JSON.stringify(payload)
  });
  const toolCall = (
    id: string | number | undefined,
    name: string,
    args: Record<string, unknown>
  ) => ({
    jsonrpc: "2.0",
    ...(id !== undefined ? { id } : {}),
    method: "tools/call",
    params: { name, arguments: args }
  });

  await call(
    toolCall("retry-7", "memory.get_context_bundle", {
      projectId: "project-a"
    }),
    "caller-transport-key-one"
  );
  await call(
    toolCall("retry-7", "memory.get_context_bundle", {
      projectId: "project-a"
    }),
    "caller-transport-key-two"
  );
  await call(toolCall("retry-8", "memory.get_context_bundle", { projectId: "project-a" }));
  await call(toolCall("retry-7", "memory.start_session", { projectId: "project-a" }));
  const batchResponse = await call([
    toolCall(7, "memory.start_session", { projectId: "project-a" }),
    toolCall("7", "memory.start_session", { projectId: "project-a" })
  ]);
  const missingIdResponse = await call(
    toolCall(undefined, "memory.start_session", { projectId: "project-a" })
  );
  const strictInputResponse = await call(toolCall("strict-input", "memory.start_session", {
    projectId: "project-a",
    idempotencyKey: "caller-must-not-widen-schema"
  }));

  assert.equal(observations.length, 6, batchResponse.body);
  const [
    first,
    retry,
    differentId,
    differentOperation,
    numericId,
    stringId
  ] = observations;
  for (const observation of observations) {
    assert.equal(observation!.admitted, true, observation!.operation);
    assert.match(observation!.contextIdempotencyKey || "", /^mcp:v1:[a-f0-9]{64}$/);
    assert.equal(observation!.contextIdempotencyKey!.length, 71);
    assert.equal(
      observation!.invocationIdempotencyKey,
      observation!.contextIdempotencyKey
    );
    assert.equal(observation!.inputHasCallerIdempotencyKey, false);
  }
  assert.equal(first!.contextIdempotencyKey, retry!.contextIdempotencyKey);
  assert.notEqual(first!.contextIdempotencyKey, differentId!.contextIdempotencyKey);
  assert.notEqual(first!.contextIdempotencyKey, differentOperation!.contextIdempotencyKey);
  assert.notEqual(numericId!.contextIdempotencyKey, stringId!.contextIdempotencyKey);
  assert.equal(numericId!.requestId, 7);
  assert.equal(stringId!.requestId, "7");
  assert.deepEqual(
    (JSON.parse(batchResponse.body) as Array<{ id: string | number }>).map((item) => item.id),
    [7, "7"]
  );
  assert.equal(JSON.parse(missingIdResponse.body).error.code, -32600);
  assert.equal(JSON.parse(strictInputResponse.body).error.code, -32602);
});

test("a recognized agent credential cannot be downgraded by personal-preview routing", async (t) => {
  const admission = deterministicAdmission(t);
  const config = testConfig({ profile: "personal-preview", agentSurfaceEnabled: true });
  const { base } = await startComposedServer(t, config, admission);
  const credential = "preview-agent-credential-".padEnd(64, "p");
  registerAgentCredential(admission, {
    credential,
    principalId: "preview-agent",
    sessionOwner: "preview-agent-test",
    projectId: "project-a",
    ttlMs: 10_000
  });

  const response = await request(`${base}/agent-rpc`, {
    method: "POST",
    headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
    body: JSON.stringify({ version: 1, id: 1, method: "memory.health", params: {} })
  });
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.body, new RegExp(credential));
});

test("daemon composition derives exact registry operation grants per audience", () => {
  const admission = createDaemonAdmissionServices(testConfig({ profile: "hardened-local" }));
  const admin = admission.authority.authenticate(TEST_TOKEN);
  assert.ok(admin);
  assert.deepEqual([...admin.operations].sort(), [...operationsForAudience("admin")].sort());

  const credential = "agent-registry-credential-".padEnd(64, "z");
  const agent = registerAgentCredential(admission, {
    credential,
    principalId: "agent-registry",
    sessionOwner: "registry-test",
    projectId: "project-a",
    ttlMs: 10_000
  });
  assert.deepEqual([...agent.operations].sort(), [...operationsForAudience("agent")].sort());
});

test("hardened composition registers only a distinct configured agent credential", () => {
  const credential = "configured-agent-credential-".padEnd(64, "q");
  const admission = createDaemonAdmissionServices(testConfig({
    profile: "hardened-local",
    agentSurfaceEnabled: true,
    agentCredential: credential,
    agentProjectId: "project-a"
  }));
  const principal = admission.authority.authenticate(credential);
  assert.ok(principal);
  assert.equal(principal.audience, "agent");
  assert.equal(principal.projectId, "project-a");
  assert.equal(admission.authority.authenticate(TEST_TOKEN)?.audience, "admin");
  assert.throws(() => createDaemonAdmissionServices(testConfig({
    profile: "hardened-local",
    agentSurfaceEnabled: true
  })), /distinct project-bound credential/);
});

test("token resolution generates and reuses a persisted token", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-token-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "daemon-token");
  const originalToken = process.env.AIMEM_AUTH_TOKEN;
  const originalFile = process.env.AIMEM_TOKEN_FILE;
  delete process.env.AIMEM_AUTH_TOKEN;
  process.env.AIMEM_TOKEN_FILE = file;
  t.after(() => {
    if (originalToken === undefined) delete process.env.AIMEM_AUTH_TOKEN;
    else process.env.AIMEM_AUTH_TOKEN = originalToken;
    if (originalFile === undefined) delete process.env.AIMEM_TOKEN_FILE;
    else process.env.AIMEM_TOKEN_FILE = originalFile;
  });

  assert.equal(tokenFilePath(), file);
  const first = resolveAuthToken();
  assert.match(first, /^[0-9a-f]{64}$/);
  const second = resolveAuthToken();
  assert.equal(second, first);
  if (process.platform !== "win32") {
    const stat = await fs.stat(file);
    assert.equal(stat.mode & 0o777, 0o600);
  }
});

test("no fallback credential remains anywhere in the daemon or client", async () => {
  const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
  const files = [
    path.join(repoRoot, "apps", "daemon", "src", "config.ts"),
    path.join(repoRoot, "packages", "api-client", "src", "index.ts")
  ];
  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    assert.ok(!content.includes("local-dev-token"), `${file} still contains the fallback credential`);
  }
});
