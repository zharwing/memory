import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  RPC_COMPATIBILITY_VERSION,
  createPublicError,
  type OperationName,
  type PrincipalAudience
} from "@zharwing/memory-core";
import {
  AgentMemoryClient,
  AimemClient,
  BrowserMemoryClient,
  NonBrowserMemoryClient,
  ZharwingMemoryClient,
  normalizeLocalDaemonBaseUrl,
  type AimemClientOptions
} from "./index.js";
import {
  BrowserMemoryTransport,
  BrowserSessionController,
  type BrowserSessionAccess
} from "./browser-transport.js";
import { OperationClient, OperationError, type ClientRuntime } from "./client.js";
import { NonBrowserCredentialTransport } from "./credential-transport.js";
import { TauriMemoryTransport, type TauriInvoke } from "./tauri-transport.js";
import {
  ResponseLimitError,
  TransportAccessError,
  utf8ByteLength,
  type MemoryTransport,
  type TransportRequest,
  type TransportResponse
} from "./transport.js";

const CORRELATION_ID = "contract-correlation-id";

type CarrierKind = "fake" | "browser" | "tauri";

interface WireReply {
  bodyText: string;
  status?: number;
  contentType?: string;
  declaredLength?: number;
}

interface ObservedRequest {
  audience: PrincipalAudience;
  operation: string;
  version: number;
  correlationId: string;
  input: Record<string, unknown>;
  signal?: AbortSignal;
  headers?: Headers;
  url?: string;
  credentials?: RequestCredentials;
  idempotencyKey?: string;
}

type Responder = (request: ObservedRequest) => WireReply | Promise<WireReply>;

interface ClientHarness {
  client: OperationClient;
  requests: ObservedRequest[];
}

const clientRuntime: ClientRuntime = {
  createId: () => CORRELATION_ID,
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle)
};

const activeBrowserSession: BrowserSessionAccess = {
  state: {
    status: "active",
    expiresAt: "2099-01-01T00:00:00.000Z",
    rotationId: "rotation-test",
    projectId: null
  },
  withProjectSession: (_projectId, invoke) => invoke("synthetic-csrf"),
  handleAccessStatus(status): never {
    throw new TransportAccessError(status === 403 ? "forbidden" : "unauthorized", status === 403 ? 403 : 401);
  }
};

for (const carrier of ["fake", "browser", "tauri"] as const) {
  test(`${carrier} carrier accepts a valid typed response`, async () => {
    const harness = createHarness(carrier, () => reply(successEnvelope({
      status: "ok",
      memoryRoot: "D:/memory"
    })));

    const result = await harness.client.operation("memory.health", {});

    assert.deepEqual(result, { status: "ok", memoryRoot: "D:/memory" });
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.requests[0]?.operation, "memory.health");
    assert.equal(harness.requests[0]?.version, RPC_COMPATIBILITY_VERSION);
    assert.equal(harness.requests[0]?.correlationId, CORRELATION_ID);
    assert.deepEqual(harness.requests[0]?.input, {});
  });

  test(`${carrier} carrier rejects malformed JSON`, async () => {
    const harness = createHarness(carrier, () => reply("not-json"));

    await rejectsWithCode(harness.client.operation("memory.health", {}), "protocol");
  });

  test(`${carrier} carrier rejects an empty response`, async () => {
    const harness = createHarness(carrier, () => reply(""));

    await rejectsWithCode(harness.client.operation("memory.health", {}), "protocol");
  });

  test(`${carrier} carrier rejects an HTML response`, async () => {
    const harness = createHarness(carrier, () => ({
      bodyText: "<html><body>daemon unavailable</body></html>",
      contentType: "text/html",
      status: 503
    }));

    await rejectsWithCode(harness.client.operation("memory.health", {}), "protocol");
  });

  test(`${carrier} carrier rejects truncated JSON`, async () => {
    const harness = createHarness(carrier, () => reply(
      `{"version":${RPC_COMPATIBILITY_VERSION},"id":"${CORRELATION_ID}","ok":true,"result":`
    ));

    await rejectsWithCode(harness.client.operation("memory.health", {}), "protocol");
  });

  test(`${carrier} carrier rejects a response over the operation byte limit`, async () => {
    const harness = createHarness(carrier, () => ({
      bodyText: "body is never trusted",
      contentType: "application/json",
      declaredLength: 10_000_000
    }));

    await rejectsWithCode(harness.client.operation("memory.health", {}), "protocol");
  });

  test(`${carrier} carrier rejects the wrong correlation id`, async () => {
    const harness = createHarness(carrier, () => reply(successEnvelope(
      { status: "ok", memoryRoot: "D:/memory" },
      { id: "some-other-request" }
    )));

    await rejectsWithCode(harness.client.operation("memory.health", {}), "protocol");
  });

  test(`${carrier} carrier rejects an incompatible response version`, async () => {
    const harness = createHarness(carrier, () => reply(successEnvelope(
      { status: "ok", memoryRoot: "D:/memory" },
      { version: RPC_COMPATIBILITY_VERSION + 1 }
    )));

    await rejectsWithCode(harness.client.operation("memory.health", {}), "compatibility");
  });

  test(`${carrier} carrier rejects an invalid typed output`, async () => {
    const harness = createHarness(carrier, () => reply(successEnvelope({ status: "ok" })));

    await rejectsWithCode(harness.client.operation("memory.health", {}), "protocol");
  });

  test(`${carrier} carrier rejects an invalid public error`, async () => {
    const harness = createHarness(carrier, () => reply(errorEnvelope({
      code: "unavailable",
      messageId: "operation.validation",
      category: "validation",
      retry: "never"
    }), 503));

    await rejectsWithCode(harness.client.operation("memory.health", {}), "protocol");
  });

  test(`${carrier} carrier preserves a valid public error`, async () => {
    const publicError = createPublicError("unavailable", { debugId: "debug-123" });
    const harness = createHarness(carrier, () => reply(errorEnvelope(publicError), 503));

    await assert.rejects(
      harness.client.operation("memory.health", {}),
      (error: unknown) => {
        assert.ok(error instanceof OperationError);
        assert.equal(error.code, "unavailable");
        assert.equal(error.publicError.debugId, "debug-123");
        assert.equal(error.correlationId, CORRELATION_ID);
        return true;
      }
    );
  });

  if (carrier !== "tauri") {
    test(`${carrier} carrier rejects a successful envelope on a failed HTTP status`, async () => {
      const harness = createHarness(carrier, () => reply(successEnvelope({
        status: "ok",
        memoryRoot: "D:/memory"
      }), 500));

      await rejectsWithCode(harness.client.operation("memory.health", {}), "protocol");
    });
  }

  test(`${carrier} carrier maps read timeouts to timeout`, async () => {
    const harness = createHarness(carrier, ({ signal }) => waitForAbort(signal));

    await rejectsWithCode(
      harness.client.operation("memory.health", {}, { timeoutMs: 5 }),
      "timeout"
    );
  });

  test(`${carrier} carrier maps caller cancellation to cancelled`, async () => {
    const harness = createHarness(carrier, ({ signal }) => waitForAbort(signal));
    const controller = new AbortController();
    const operation = harness.client.operation("memory.health", {}, { signal: controller.signal });
    controller.abort(new Error("caller cancelled"));

    await rejectsWithCode(operation, "cancelled");
  });

  test(`${carrier} carrier maps an ambiguous durable context-bundle write to outcome_unknown`, async () => {
    const harness = createHarness(carrier, () => {
      throw new TypeError("connection reset after request dispatch");
    });

    await rejectsWithCode(
      harness.client.operation(
        "memory.get_context_bundle",
        { projectId: "p1" },
        { idempotencyKey: "context-bundle:stable-1" }
      ),
      "outcome_unknown"
    );
  });
}

test("browser carrier sends cookie credentials, memory-only CSRF, and no bearer", async () => {
  const requests: ObservedRequest[] = [];
  const transport = new BrowserMemoryTransport({
    baseUrl: "http://127.0.0.1:37841/",
    session: activeBrowserSession,
    fetch: createFetch(async (request) => {
      requests.push(request);
      return reply(successEnvelope({ status: "ok", memoryRoot: "D:/memory" }));
    })
  });
  const client = new OperationClient(transport, clientRuntime, "browser");

  await client.operation("memory.health", {}, {
    correlationId: CORRELATION_ID,
    idempotencyKey: "idem-1",
    expectedRevision: 42
  });

  const request = requests[0];
  assert.ok(request);
  assert.equal(request.url, "http://127.0.0.1:37841/rpc");
  assert.equal(request.headers?.get("accept"), "application/json");
  assert.equal(request.headers?.get("content-type"), "application/json");
  assert.equal(request.credentials, "include");
  assert.equal(request.headers?.has("authorization"), false);
  assert.equal(request.headers?.get("x-csrf-token"), "synthetic-csrf");
  assert.equal(request.headers?.get("x-correlation-id"), CORRELATION_ID);
  assert.equal(request.headers?.get("x-rpc-compatibility-version"), String(RPC_COMPATIBILITY_VERSION));
  assert.equal(request.headers?.get("x-idempotency-key"), "idem-1");
  assert.equal(request.headers?.get("if-match"), "42");
});

test("browser carrier enforces the actual UTF-8 response size when content-length is absent", async () => {
  const oversized = "x".repeat(2 * 1024 * 1024 + 1);
  const transport = new BrowserMemoryTransport({
    baseUrl: "http://127.0.0.1:37841",
    session: activeBrowserSession,
    fetch: createFetch(() => ({ bodyText: oversized, contentType: "application/json" }))
  });
  const client = new OperationClient(transport, clientRuntime, "browser");

  await rejectsWithCode(client.operation("memory.health", {}), "protocol");
});

test("tauri carrier maps the versioned operation request to the invoke command", async () => {
  const invocations: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const invoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
    invocations.push({ command, args });
    return successEnvelope({ status: "ok", memoryRoot: "D:/memory" }) as T;
  };
  const client = new OperationClient(new TauriMemoryTransport({
    invoke,
    command: "memory_rpc_contract_test"
  }), clientRuntime, "desktop");

  await client.operation("memory.health", {}, {
    correlationId: CORRELATION_ID,
    idempotencyKey: "idem-1",
    expectedRevision: 42
  });

  assert.deepEqual(invocations, [{
    command: "memory_rpc_contract_test",
    args: {
      request: JSON.stringify({
        version: RPC_COMPATIBILITY_VERSION,
        id: CORRELATION_ID,
        method: "memory.health",
        params: {},
        idempotencyKey: "idem-1",
        expectedRevision: 42
      }),
      projectId: null
    }
  }]);
});

test("browser session bootstrap, RPC, rotation, and revocation stay cookie/CSRF-only", async () => {
  const observed: Array<{ url: string; init?: RequestInit }> = [];
  const replies = [
    jsonResponse({ csrfToken: "synthetic-csrf-one", expiresAt: "2099-01-01T00:00:00.000Z", rotationId: "rotation-one", projectId: null }),
    jsonResponse(successEnvelope({ status: "ok", memoryRoot: "D:/memory" })),
    jsonResponse({ csrfToken: "synthetic-csrf-two", expiresAt: "2099-01-02T00:00:00.000Z", rotationId: "rotation-two", projectId: null }),
    jsonResponse({ csrfToken: "synthetic-csrf-three", expiresAt: "2099-01-03T00:00:00.000Z", rotationId: "rotation-three", projectId: "synthetic-project-id" }),
    jsonResponse(successEnvelope({ status: "ok", memoryRoot: "D:/memory" })),
    new Response(null, { status: 204 })
  ];
  const requestFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    observed.push({ url: String(input), init });
    const response = replies.shift();
    assert.ok(response);
    return response;
  }) as typeof fetch;
  const session = new BrowserSessionController({ baseUrl: "http://127.0.0.1:37841/", fetch: requestFetch });
  const client = new OperationClient(
    new BrowserMemoryTransport({ baseUrl: "http://127.0.0.1:37841/", fetch: requestFetch, session }),
    clientRuntime,
    "browser"
  );

  const bootstrapResult = await session.bootstrap("synthetic-single-use-bootstrap");
  await client.operation("memory.health", {});
  const rotationResult = await session.rotate();
  const projectResult = await session.bindProject("synthetic-project-id");
  await client.operation("memory.health", {});
  await session.revoke();

  assert.deepEqual(bootstrapResult, {
    expiresAt: "2099-01-01T00:00:00.000Z",
    rotationId: "rotation-one",
    projectId: null
  });
  assert.deepEqual(rotationResult, {
    expiresAt: "2099-01-02T00:00:00.000Z",
    rotationId: "rotation-two",
    projectId: null
  });
  assert.deepEqual(projectResult, {
    expiresAt: "2099-01-03T00:00:00.000Z",
    rotationId: "rotation-three",
    projectId: "synthetic-project-id"
  });
  assert.deepEqual(session.state, { status: "locked", reason: "revoked" });
  assert.equal(observed[0]?.url, "http://127.0.0.1:37841/browser-session/bootstrap");
  assert.deepEqual(JSON.parse(String(observed[0]?.init?.body)), { code: "synthetic-single-use-bootstrap" });
  assert.equal(new Headers(observed[0]?.init?.headers).has("authorization"), false);
  assert.equal(new Headers(observed[0]?.init?.headers).has("x-csrf-token"), false);
  assert.equal(new Headers(observed[1]?.init?.headers).get("x-csrf-token"), "synthetic-csrf-one");
  assert.equal(new Headers(observed[2]?.init?.headers).get("x-csrf-token"), "synthetic-csrf-one");
  assert.equal(observed[3]?.url, "http://127.0.0.1:37841/browser-session/project");
  assert.deepEqual(JSON.parse(String(observed[3]?.init?.body)), { projectId: "synthetic-project-id" });
  assert.equal(new Headers(observed[3]?.init?.headers).get("x-csrf-token"), "synthetic-csrf-two");
  assert.equal(new Headers(observed[4]?.init?.headers).get("x-csrf-token"), "synthetic-csrf-three");
  assert.equal(new Headers(observed[5]?.init?.headers).get("x-csrf-token"), "synthetic-csrf-three");
  for (const request of observed) {
    assert.equal(request.init?.credentials, "include");
    assert.equal(new Headers(request.init?.headers).has("authorization"), false);
  }
  const browserVisibleState = JSON.stringify({ session, bootstrapResult, rotationResult, projectResult });
  assert.doesNotMatch(browserVisibleState, /synthetic-csrf-(?:one|two|three)/);
  assert.doesNotMatch(browserVisibleState, /synthetic-single-use-bootstrap/);
});

test("personal-preview browser bootstrap is an explicit credential-free session exchange", async () => {
  const observed: Array<{ url: string; init?: RequestInit }> = [];
  const session = new BrowserSessionController({
    baseUrl: "http://127.0.0.1:37841",
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      observed.push({ url: String(input), init });
      return jsonResponse({
        csrfToken: "synthetic-preview-csrf",
        expiresAt: "2099-01-01T00:00:00.000Z",
        rotationId: "synthetic-preview-rotation",
        projectId: null
      });
    }) as typeof fetch
  });

  await session.bootstrapPersonalPreview();

  assert.equal(observed[0]?.url, "http://127.0.0.1:37841/browser-session/preview");
  assert.deepEqual(JSON.parse(String(observed[0]?.init?.body)), {});
  assert.equal(observed[0]?.init?.credentials, "include");
  assert.equal(new Headers(observed[0]?.init?.headers).has("authorization"), false);
  assert.equal(new Headers(observed[0]?.init?.headers).has("x-csrf-token"), false);
});

test("browser clients preserve the native fetch receiver during startup and RPC", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  const receiverSensitiveFetch = function(this: typeof globalThis): Promise<Response> {
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    requestCount += 1;
    return Promise.resolve(requestCount === 1
      ? jsonResponse({
          csrfToken: "receiver-safe-csrf",
          expiresAt: "2099-01-01T00:00:00.000Z",
          rotationId: "receiver-safe-rotation",
          projectId: null
        })
      : jsonResponse(successEnvelope({ status: "ok", memoryRoot: "D:/memory" })));
  } as typeof fetch;
  globalThis.fetch = receiverSensitiveFetch;
  try {
    const session = new BrowserSessionController({ baseUrl: "http://127.0.0.1:37841" });
    const client = new OperationClient(
      new BrowserMemoryTransport({ baseUrl: "http://127.0.0.1:37841", session }),
      clientRuntime,
      "browser"
    );
    await session.bootstrapPersonalPreview();
    await client.operation("memory.health", {});
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("concurrent project RPCs serialize rebinding and never reuse an old CSRF after rotation", async () => {
  const sequence: Array<{ path: string; projectId?: string; csrf?: string }> = [];
  const requestFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const headers = new Headers(init?.headers);
    if (path === "/browser-session/bootstrap") {
      return jsonResponse({
        csrfToken: "csrf-initial",
        expiresAt: "2099-01-01T00:00:00.000Z",
        rotationId: "rotation-initial",
        projectId: null
      });
    }
    if (path === "/browser-session/project") {
      const projectId = String(body.projectId);
      sequence.push({ path, projectId, csrf: headers.get("x-csrf-token") ?? undefined });
      return jsonResponse({
        csrfToken: `csrf-${projectId}`,
        expiresAt: "2099-01-01T00:00:00.000Z",
        rotationId: `rotation-${projectId}`,
        projectId
      });
    }
    sequence.push({
      path,
      projectId: String((body.params as Record<string, unknown>).projectId),
      csrf: headers.get("x-csrf-token") ?? undefined
    });
    return jsonResponse(successEnvelope({}), 200);
  }) as typeof fetch;
  const session = new BrowserSessionController({ baseUrl: "http://127.0.0.1:37841", fetch: requestFetch });
  const transport = new BrowserMemoryTransport({ baseUrl: "http://127.0.0.1:37841", fetch: requestFetch, session });
  await session.bootstrap("synthetic-bootstrap-concurrency");
  const invoke = (projectId: string, suffix: string) => transport.send({
    audience: "browser",
    version: RPC_COMPATIBILITY_VERSION,
    operation: "memory.get_project",
    input: { projectId },
    context: {
      timeoutMs: 1_000,
      correlationId: `correlation-${suffix}`,
      maximumResponseBytes: 1024
    }
  });

  await Promise.all([
    invoke("project-a", "a-one"),
    invoke("project-a", "a-two"),
    invoke("project-b", "b-one")
  ]);

  assert.deepEqual(sequence, [
    { path: "/browser-session/project", projectId: "project-a", csrf: "csrf-initial" },
    { path: "/rpc", projectId: "project-a", csrf: "csrf-project-a" },
    { path: "/rpc", projectId: "project-a", csrf: "csrf-project-a" },
    { path: "/browser-session/project", projectId: "project-b", csrf: "csrf-project-a" },
    { path: "/rpc", projectId: "project-b", csrf: "csrf-project-b" }
  ]);
  assert.deepEqual(session.state, {
    status: "active",
    expiresAt: "2099-01-01T00:00:00.000Z",
    rotationId: "rotation-project-b",
    projectId: "project-b"
  });
});

test("same-project browser RPCs overlap while project transitions wait for every active request", async () => {
  const rpcReleases: Array<() => void> = [];
  let rpcStarted = 0;
  let resolveBothStarted: (() => void) | undefined;
  const bothStarted = new Promise<void>((resolve) => {
    resolveBothStarted = resolve;
  });
  let projectTransitionStarted = false;
  const requestFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path === "/browser-session/bootstrap") {
      return jsonResponse({
        csrfToken: "csrf-project-a",
        expiresAt: "2099-01-01T00:00:00.000Z",
        rotationId: "rotation-project-a",
        projectId: "project-a"
      });
    }
    if (path === "/browser-session/project") {
      projectTransitionStarted = true;
      const body = JSON.parse(String(init?.body)) as { projectId: string };
      return jsonResponse({
        csrfToken: `csrf-${body.projectId}`,
        expiresAt: "2099-01-01T00:00:00.000Z",
        rotationId: `rotation-${body.projectId}`,
        projectId: body.projectId
      });
    }
    rpcStarted += 1;
    if (rpcStarted === 2) resolveBothStarted?.();
    return new Promise<Response>((resolve) => {
      rpcReleases.push(() => resolve(jsonResponse(successEnvelope({}), 200)));
    });
  }) as typeof fetch;
  const session = new BrowserSessionController({
    baseUrl: "http://127.0.0.1:37841",
    fetch: requestFetch
  });
  const transport = new BrowserMemoryTransport({
    baseUrl: "http://127.0.0.1:37841",
    fetch: requestFetch,
    session
  });
  await session.bootstrap("synthetic-overlap-bootstrap");
  const invoke = (suffix: string) => transport.send({
    audience: "browser",
    version: RPC_COMPATIBILITY_VERSION,
    operation: "memory.get_project",
    input: { projectId: "project-a" },
    context: {
      timeoutMs: 1_000,
      correlationId: `correlation-${suffix}`,
      maximumResponseBytes: 1024
    }
  });

  const first = invoke("first");
  const second = invoke("second");
  await Promise.race([
    bothStarted,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error("same-project RPCs were serialized")), 250);
    })
  ]);
  assert.equal(rpcStarted, 2);

  const transition = session.bindProject("project-b");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(projectTransitionStarted, false);
  rpcReleases[0]?.();
  await first;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(projectTransitionStarted, false);
  rpcReleases[1]?.();
  await second;
  await transition;

  assert.equal(projectTransitionStarted, true);
  assert.deepEqual(session.state, {
    status: "active",
    expiresAt: "2099-01-01T00:00:00.000Z",
    rotationId: "rotation-project-b",
    projectId: "project-b"
  });
});

for (const status of [401, 403] as const) {
  test(`browser ${status} clears CSRF and enters a typed locked state`, async () => {
    let requestCount = 0;
    const requestFetch = (async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return jsonResponse({
          csrfToken: "synthetic-csrf-lock-test",
          expiresAt: "2099-01-01T00:00:00.000Z",
          rotationId: "rotation-lock-test",
          projectId: null
        });
      }
      return jsonResponse({}, status);
    }) as typeof fetch;
    const session = new BrowserSessionController({ baseUrl: "http://127.0.0.1:37841", fetch: requestFetch });
    const client = new OperationClient(
      new BrowserMemoryTransport({ baseUrl: "http://127.0.0.1:37841", fetch: requestFetch, session }),
      clientRuntime,
      "browser"
    );
    await session.bootstrap("synthetic-bootstrap-lock-test");

    await rejectsWithCode(client.operation("memory.health", {}), status === 401 ? "unauthorized" : "forbidden");

    assert.deepEqual(session.state, {
      status: "locked",
      reason: status === 401 ? "unauthorized" : "forbidden"
    });
    await rejectsWithCode(client.operation("memory.health", {}), "unauthorized");
    assert.equal(requestCount, 2, "a locked session must not issue another request");
  });
}

test("the non-browser client keeps typed admin operations separate from raw agent calls", async () => {
  const observed: ObservedRequest[] = [];
  const transport = new NonBrowserCredentialTransport({
    baseUrl: "http://127.0.0.1:37841",
    credential: "synthetic-agent-credential",
    fetch: createFetch((request) => {
      observed.push(request);
      return reply(successEnvelope({ status: "ok", memoryRoot: "D:/memory" }));
    })
  });
  const client = new NonBrowserMemoryClient({ transport, runtime: clientRuntime });

  await client.operation("memory.health", {});
  const agentTransport = new NonBrowserCredentialTransport({
    baseUrl: "http://127.0.0.1:37841",
    credential: "synthetic-agent-credential",
    fetch: createFetch((request) => {
      observed.push(request);
      return reply(successEnvelope({
        schema: "zharwing.agent-projection.v1",
        status: "ok",
        data: { status: "ok" },
        completeness: { status: "complete", excludedItems: 0, redactions: 0, truncatedItems: 0 }
      }));
    })
  });
  await new NonBrowserMemoryClient({ transport: agentTransport, runtime: clientRuntime }).callAgent("memory.health", {});

  assert.equal(observed[0]?.url, "http://127.0.0.1:37841/rpc");
  assert.equal(observed[0]?.headers?.get("authorization"), "Bearer synthetic-agent-credential");
  assert.equal(observed[0]?.credentials, undefined);
  assert.equal(observed[1]?.url, "http://127.0.0.1:37841/agent-rpc");
  assert.equal(observed[1]?.headers?.get("authorization"), "Bearer synthetic-agent-credential");
  assert.throws(() => new NonBrowserMemoryClient(), /explicit trusted-runtime credential/);
});

test("the agent credential is not object-serializable", () => {
  const canary = "SYNTHETIC_AGENT_SERIALIZATION_CANARY";
  const client = new AgentMemoryClient({
    baseUrl: "http://127.0.0.1:37841",
    agentCredential: canary,
    fetch: createFetch(() => reply(successEnvelope({})))
  });

  assert.doesNotMatch(JSON.stringify(client), new RegExp(canary));
});

test("legacy trusted Node facade discovers role-separated credentials without Vite fallbacks", async () => {
  const previous = {
    url: process.env.ZHARWING_MEMORY_DAEMON_URL,
    admin: process.env.ZHARWING_MEMORY_AUTH_TOKEN,
    agent: process.env.ZHARWING_MEMORY_AGENT_CREDENTIAL
  };
  process.env.ZHARWING_MEMORY_DAEMON_URL = "http://127.0.0.1:37841";
  process.env.ZHARWING_MEMORY_AUTH_TOKEN = "synthetic-admin-role";
  process.env.ZHARWING_MEMORY_AGENT_CREDENTIAL = "synthetic-agent-role";
  const requests: Array<{ url: string; authorization: string | null }> = [];
  try {
    const client = new ZharwingMemoryClient({
      runtime: clientRuntime,
      fetch: createFetch((request) => {
        requests.push({ url: request.url ?? "", authorization: request.headers?.get("authorization") ?? null });
        return reply(successEnvelope(request.url?.endsWith("/agent-rpc") ? {
          schema: "zharwing.agent-projection.v1",
          status: "ok",
          data: { status: "ok" },
          completeness: { status: "complete", excludedItems: 0, redactions: 0, truncatedItems: 0 }
        } : { status: "ok", memoryRoot: "D:/memory" }));
      })
    });
    await client.operation("memory.health", {});
    await client.callAgent("memory.health", {});
    await client.call("memory.health", {});
    assert.deepEqual(requests, [
      { url: "http://127.0.0.1:37841/rpc", authorization: "Bearer synthetic-admin-role" },
      { url: "http://127.0.0.1:37841/agent-rpc", authorization: "Bearer synthetic-agent-role" },
      { url: "http://127.0.0.1:37841/rpc", authorization: "Bearer synthetic-admin-role" }
    ]);
  } finally {
    restoreEnv("ZHARWING_MEMORY_DAEMON_URL", previous.url);
    restoreEnv("ZHARWING_MEMORY_AUTH_TOKEN", previous.admin);
    restoreEnv("ZHARWING_MEMORY_AGENT_CREDENTIAL", previous.agent);
  }
});

test("legacy facade preserves AIMEM aliases, generic calls, and all convenience methods", async () => {
  const previous = {
    currentUrl: process.env.ZHARWING_MEMORY_DAEMON_URL,
    currentToken: process.env.ZHARWING_MEMORY_AUTH_TOKEN,
    legacyUrl: process.env.AIMEM_DAEMON_URL,
    legacyToken: process.env.AIMEM_AUTH_TOKEN
  };
  delete process.env.ZHARWING_MEMORY_DAEMON_URL;
  delete process.env.ZHARWING_MEMORY_AUTH_TOKEN;
  process.env.AIMEM_DAEMON_URL = "http://127.0.0.1:37841";
  process.env.AIMEM_AUTH_TOKEN = "synthetic-legacy-admin";
  const observed: Array<{ url: string; method: string; version: unknown; authorization: string | null }> = [];
  try {
    const options: AimemClientOptions = {
      runtime: clientRuntime,
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        observed.push({
          url: String(input),
          method: String(request.method),
          version: request.version,
          authorization: new Headers(init?.headers).get("authorization")
        });
        return jsonResponse({ id: request.id, ok: true, result: { method: request.method } });
      }) as typeof fetch
    };
    const client = new AimemClient(options);
    assert.equal(client.baseUrl, "http://127.0.0.1:37841");
    assert.equal(client.authToken, "synthetic-legacy-admin");

    const generic = await client.call<{ method: string }>("memory.compatibility_probe", {});
    const agent = await client.callAgent<{ method: string }>("memory.health", {});
    assert.equal(generic.method, "memory.compatibility_probe");
    assert.equal(agent.method, "memory.health");

    await client.health();
    await client.listProjects();
    await client.getStartupState({ projectId: "project-a" });
    await client.getSessionDetail({ projectId: "project-a", sessionId: "session-a" });
    await client.getContextBundle({ projectId: "project-a" });
    await client.getGraph({ projectId: "project-a" });
    await client.getSemanticGraphSettings({ projectId: "project-a" });
    await client.updateAssistantPolicy({ projectId: "project-a" });
    await client.updateSemanticGraphSettings({ projectId: "project-a" });
    await client.getSemanticGraphStatus({ projectId: "project-a" });
    await client.listSemanticEdges({ projectId: "project-a" });
    await client.updateSemanticEdgeStatus({ projectId: "project-a" });
    await client.listSemanticGraphRuns({ projectId: "project-a" });
    await client.getSemanticGraphRun({ projectId: "project-a" });
    await client.previewSemanticGraphAnalysis({ projectId: "project-a" });
    await client.analyzeSemanticGraph({ projectId: "project-a" });
    await client.checkSemanticGraphProvider({ projectId: "project-a" });
    await client.proposeSemanticEdges({ projectId: "project-a" });
    await client.acceptSemanticEdgesProposal({ projectId: "project-a" });

    assert.equal(observed.length, 21);
    assert.equal(observed[0]?.url, "http://127.0.0.1:37841/rpc");
    assert.equal(observed[1]?.url, "http://127.0.0.1:37841/agent-rpc");
    assert.ok(observed.every((request) => request.version === undefined));
    assert.ok(observed.every((request) => request.authorization === "Bearer synthetic-legacy-admin"));
  } finally {
    restoreEnv("ZHARWING_MEMORY_DAEMON_URL", previous.currentUrl);
    restoreEnv("ZHARWING_MEMORY_AUTH_TOKEN", previous.currentToken);
    restoreEnv("AIMEM_DAEMON_URL", previous.legacyUrl);
    restoreEnv("AIMEM_AUTH_TOKEN", previous.legacyToken);
  }
});

test("legacy facade refuses to surface arbitrary daemon error text", async () => {
  const client = new ZharwingMemoryClient({
    baseUrl: "http://127.0.0.1:37841",
    authToken: "synthetic-admin",
    runtime: clientRuntime,
    fetch: (async () => jsonResponse({
      ok: false,
      error: { message: "PRIVATE_EXCEPTION_CANARY C:/private/path" }
    }, 400)) as typeof fetch
  });
  await assert.rejects(
    client.call("memory.health"),
    (error: unknown) => error instanceof Error &&
      error.message === "Zharwing Memory RPC failed: memory.health"
  );
});

test("raw agent mutations require and transport a stable idempotency key", async () => {
  const requests: ObservedRequest[] = [];
  const transport: MemoryTransport = {
    async send(request) {
      requests.push(observeTransportRequest(request));
      return toTransportResponse(reply(successEnvelope({
        status: "accepted",
        operation: "memory.start_session",
        projectId: "project-a",
        resultVisibility: "withheld"
      })), request);
    }
  };
  const client = new NonBrowserMemoryClient({ transport, runtime: clientRuntime });
  await rejectsWithCode(
    client.callAgent("memory.start_session", { projectId: "project-a" }),
    "validation"
  );
  await client.callAgent(
    "memory.start_session",
    { projectId: "project-a" },
    { idempotencyKey: "session:start:stable-1" }
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.idempotencyKey, "session:start:stable-1");
});

test("raw agent transport loss after a mutation is outcome_unknown", async () => {
  const transport: MemoryTransport = {
    async send() {
      throw new TypeError("connection reset after dispatch");
    }
  };
  const client = new NonBrowserMemoryClient({ transport, runtime: clientRuntime });
  await rejectsWithCode(client.callAgent(
    "memory.save_checkpoint",
    { projectId: "project-a", sessionId: "session-a", summary: "checkpoint" },
    { idempotencyKey: "checkpoint:stable-1" }
  ), "outcome_unknown");
});

test("raw agent output accepts only the registered projection envelope", async () => {
  const validBundle = {
    schema: "zharwing.memory.bundle.v1",
    status: "ok",
    projectId: "project-a",
    created: "2026-08-12T10:00:00.000Z",
    budget: { maxTokens: 100, usedTokens: 0, truncated: false },
    sections: [],
    completeness: { status: "complete", excludedItems: 0, redactions: 0, truncatedItems: 0 },
    safetyStatus: "clean"
  };
  const transport: MemoryTransport = {
    async send(request) {
      const result = request.operation === "memory.get_context_bundle"
        ? validBundle
        : { status: "ok", memoryRoot: "D:/private-human-shape" };
      return toTransportResponse(reply(successEnvelope(result)), request);
    }
  };
  const client = new NonBrowserMemoryClient({ transport, runtime: clientRuntime });
  assert.deepEqual(await client.callAgent(
    "memory.get_context_bundle",
    { projectId: "project-a" },
    { idempotencyKey: "context:stable-1" }
  ), validBundle);
  await rejectsWithCode(client.callAgent("memory.health", {}), "protocol");
  await rejectsWithCode(client.callAgent("memory.mcp_install", {}), "forbidden");
});

test("raw agent output rejects a malicious nested wire field", async () => {
  const transport: MemoryTransport = {
    async send(request) {
      return toTransportResponse(reply(successEnvelope({
        schema: "zharwing.agent-projection.v1",
        status: "ok",
        data: [{
          id: "doc-a",
          projectId: "project-a",
          type: "document",
          title: "Safe title",
          visibility: "ai-eligible",
          snippet: "Safe snippet",
          score: 1,
          futurePrivateField: "MALICIOUS_WIRE_CANARY"
        }],
        completeness: { status: "complete", excludedItems: 0, redactions: 0, truncatedItems: 0 }
      })), request);
    }
  };
  const client = new NonBrowserMemoryClient({ transport, runtime: clientRuntime });
  await rejectsWithCode(
    client.callAgent("memory.search", { projectId: "project-a", query: "safe" }),
    "protocol"
  );
});

test("browser source and configuration have no bearer discovery or credential canary reachability", async () => {
  const canary = "synthetic-browser-config-canary";
  const client = new BrowserMemoryClient({
    baseUrl: "http://127.0.0.1:37841",
    fetch: createFetch(() => reply(successEnvelope({ status: "ok", memoryRoot: "D:/memory" }))),
    ...({ credential: canary } as Record<string, unknown>)
  });

  assert.doesNotMatch(JSON.stringify(client), new RegExp(canary));
  const browserOwnedSources = [
    "packages/api-client/src/browser-transport.ts",
    "apps/desktop/src/app/composition/browser.ts",
    "apps/desktop/src/application/operations/bootstrap-gated-client.ts",
    "apps/desktop/src/platform/browser/index.ts",
    "apps/desktop/src/platform/browser/session-bootstrap.ts",
    "apps/desktop/src/platform/browser/ui-preferences.ts"
  ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");
  assert.match(browserOwnedSources, /ZHARWING_PUBLIC_PROFILE/);
  assert.doesNotMatch(browserOwnedSources, /\bVITE_/);
  assert.doesNotMatch(browserOwnedSources, /VITE_[A-Z0-9_]*(?:AUTH|TOKEN|CREDENTIAL)/);
  assert.doesNotMatch(browserOwnedSources, /(?:ZHARWING_MEMORY|AIMEM)_(?:AUTH_TOKEN|TOKEN|CREDENTIAL)/);
  assert.doesNotMatch(browserOwnedSources, /process\.env/);
  assert.doesNotMatch(browserOwnedSources, /\bauthorization\b/i);
  const envExample = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
  assert.doesNotMatch(envExample, /VITE_[A-Z0-9_]*(?:AUTH|TOKEN|CREDENTIAL)/);
});

test("browser and credential transports accept only an exact loopback daemon origin", () => {
  assert.equal(normalizeLocalDaemonBaseUrl("http://127.0.0.1:37841/"), "http://127.0.0.1:37841");
  assert.equal(normalizeLocalDaemonBaseUrl("https://localhost:37841"), "https://localhost:37841");
  for (const value of [
    "https://attacker.example:37841",
    "http://localhost.attacker.example:37841",
    "http://user:secret@127.0.0.1:37841",
    "file:///tmp/daemon",
    "http://127.0.0.1",
    "http://127.0.0.1:37841/rpc",
    "http://127.0.0.1:37841?redirect=https://attacker.example",
    "http://127.0.0.1:37841#credential"
  ]) {
    assert.throws(() => normalizeLocalDaemonBaseUrl(value), /exact loopback|absolute local/);
    assert.throws(() => new BrowserMemoryClient({ baseUrl: value, fetch: globalThis.fetch }));
    assert.throws(() => new NonBrowserCredentialTransport({
      baseUrl: value,
      credential: "synthetic-local-credential",
      fetch: globalThis.fetch
    }));
  }
});

function createHarness(kind: CarrierKind, responder: Responder): ClientHarness {
  const requests: ObservedRequest[] = [];
  if (kind === "fake") {
    const transport: MemoryTransport = {
      async send(request) {
        const observed = observeTransportRequest(request);
        requests.push(observed);
        const wireReply = await responder(observed);
        return toTransportResponse(wireReply, request);
      }
    };
    return { client: new OperationClient(transport, clientRuntime), requests };
  }

  if (kind === "browser") {
    const transport = new BrowserMemoryTransport({
      baseUrl: "http://127.0.0.1:37841",
      session: activeBrowserSession,
      fetch: createFetch(async (request) => {
        requests.push(request);
        return responder(request);
      })
    });
    return { client: new OperationClient(transport, clientRuntime, "browser"), requests };
  }

  const invoke: TauriInvoke = async <T>(_command: string, args?: Record<string, unknown>) => {
    const operationRequest = JSON.parse(String(args?.request)) as {
      version: number;
      id: string;
      method: OperationName | string;
      params: Record<string, unknown>;
    };
    const observed: ObservedRequest = {
      audience: "desktop",
      operation: operationRequest.method,
      version: operationRequest.version,
      correlationId: operationRequest.id,
      input: operationRequest.params
    };
    requests.push(observed);
    const wireReply = await responder(observed);
    return tauriPayload(wireReply) as T;
  };
  const transport = new TauriMemoryTransport({ invoke });
  return { client: new OperationClient(transport, clientRuntime, "desktop"), requests };
}

function tauriPayload(wireReply: WireReply): unknown {
  if (wireReply.declaredLength !== undefined) {
    return "x".repeat(wireReply.declaredLength);
  }
  return wireReply.bodyText;
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function createFetch(responder: Responder): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as {
      version: number;
      id: string;
      method: OperationName | string;
      params: Record<string, unknown>;
    };
    const headers = new Headers(init?.headers);
    const wireReply = await responder({
      audience: String(input).endsWith("/agent-rpc")
        ? "agent"
        : init?.credentials === "include" ? "browser" : "admin",
      operation: body.method,
      version: body.version,
      correlationId: body.id,
      input: body.params,
      signal: init?.signal ?? undefined,
      headers,
      url: String(input),
      credentials: init?.credentials
    });
    const responseHeaders = new Headers({
      "content-type": wireReply.contentType ?? "application/json"
    });
    if (wireReply.declaredLength !== undefined) {
      responseHeaders.set("content-length", String(wireReply.declaredLength));
    }
    return {
      status: wireReply.status ?? 200,
      headers: responseHeaders,
      text: async () => wireReply.bodyText
    } as Response;
  }) as typeof fetch;
}

function observeTransportRequest(request: TransportRequest): ObservedRequest {
  return {
    audience: request.audience,
    operation: request.operation,
    version: request.version,
    correlationId: request.context.correlationId,
    input: request.input,
    signal: request.context.signal,
    idempotencyKey: request.context.idempotencyKey
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function toTransportResponse(replyValue: WireReply, request: TransportRequest): TransportResponse {
  const byteLength = utf8ByteLength(replyValue.bodyText);
  if (
    (replyValue.declaredLength !== undefined && replyValue.declaredLength > request.context.maximumResponseBytes) ||
    byteLength > request.context.maximumResponseBytes
  ) {
    throw new ResponseLimitError(request.context.maximumResponseBytes);
  }
  return {
    status: replyValue.status ?? 200,
    contentType: replyValue.contentType ?? "application/json",
    bodyText: replyValue.bodyText,
    byteLength
  };
}

function successEnvelope(
  result: unknown,
  overrides: { id?: string; version?: number } = {}
): string {
  return JSON.stringify({
    version: overrides.version ?? RPC_COMPATIBILITY_VERSION,
    id: overrides.id ?? CORRELATION_ID,
    ok: true,
    result
  });
}

function errorEnvelope(error: unknown): string {
  return JSON.stringify({
    version: RPC_COMPATIBILITY_VERSION,
    id: CORRELATION_ID,
    ok: false,
    error
  });
}

function reply(bodyText: string, status = 200): WireReply {
  return { bodyText, status, contentType: "application/json" };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function waitForAbort(signal?: AbortSignal): Promise<WireReply> {
  return new Promise<WireReply>((_resolve, reject) => {
    const abort = () => reject(signal?.reason ?? new Error("aborted"));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

async function rejectsWithCode(promise: Promise<unknown>, code: OperationError["code"]): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof OperationError);
    assert.equal(error.code, code);
    assert.equal(error.correlationId, CORRELATION_ID);
    return true;
  });
}
