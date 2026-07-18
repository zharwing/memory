import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { resolveAuthToken, tokenFilePath, type DaemonConfig } from "./config.js";
import { createDaemonServer, MAX_REQUEST_BODY_BYTES } from "./server.js";
import type { MemoryService } from "./memory-service.js";

const TEST_TOKEN = "a".repeat(64);

function testConfig(overrides: Partial<DaemonConfig> = {}): DaemonConfig {
  return {
    host: "127.0.0.1",
    port: 0,
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

test("rpc requests without a token are rejected with 401", async (t) => {
  const base = await startServer(t, testConfig());
  const response = await request(`${base}/rpc`, {
    method: "POST",
    body: JSON.stringify({ id: 1, method: "memory.health" })
  });
  assert.equal(response.status, 401);
  assert.match(response.body, /Unauthorized/);
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
  assert.match(response.body, /AGENT_SURFACE_DISABLED/);
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
