import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, type TestContext } from "node:test";
import type { ContextBundle } from "@zharwing/memory-core";
import { agentSafeMethods, dispatchAgentRpc, isAgentSafeMethod, projectBundleForAgent } from "./agent-facade.js";
import { MemoryService } from "./memory-service.js";

const RPC_SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "daemon", "src", "rpc.ts");

async function tempMemoryRoot(t: TestContext): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-facade-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

function scanForMarkers(value: unknown, markers: string[], where = "$"): string[] {
  const found: string[] = [];
  if (typeof value === "string") {
    for (const marker of markers) {
      if (value.includes(marker)) found.push(`${where} contains ${marker}`);
    }
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => found.push(...scanForMarkers(entry, markers, `${where}[${index}]`)));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      for (const marker of markers) {
        if (key.includes(marker)) found.push(`${where}.${key} key contains ${marker}`);
      }
      found.push(...scanForMarkers(entry, markers, `${where}.${key}`));
    }
  }
  return found;
}

test("every RPC method is classified: agent-safe or denied as control-plane-only", async () => {
  const source = await fs.readFile(RPC_SOURCE, "utf8");
  const methods = [...new Set([...source.matchAll(/case "(memory\.[a-z_]+)"/g)].map((match) => match[1]))];
  assert.ok(methods.length > 50, `expected the full RPC inventory, found ${methods.length}`);
  const service = {} as MemoryService;
  for (const method of methods) {
    if (isAgentSafeMethod(method)) continue;
    const response = await dispatchAgentRpc(service, { id: 1, method, params: {} });
    assert.equal(response.ok, false, `${method} must be denied for agents`);
    assert.match(response.error?.message ?? "", /CONTROL_PLANE_ONLY/, method);
  }
});

test("unknown and future methods are denied by default", async () => {
  const response = await dispatchAgentRpc({} as MemoryService, { id: 1, method: "memory.brand_new_method" });
  assert.equal(response.ok, false);
  assert.match(response.error?.message ?? "", /CONTROL_PLANE_ONLY/);
});

test("the agent-safe surface stays deliberately small", () => {
  assert.deepEqual(agentSafeMethods().sort(), ["memory.get_context_bundle", "memory.health"]);
});

test("agent health is projected: no memory root, no paths", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const response = await dispatchAgentRpc(service, { id: 1, method: "memory.health" });
  assert.equal(response.ok, true);
  assert.deepEqual(response.result, { status: "ok" });
  assert.ok(!JSON.stringify(response).includes(memoryRoot));
});

test("context bundle honors requireApprovalBeforeServingContext with a typed state", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({ projectName: "Facade Approval", createPointerFile: false });
  const project = await service.createProject({ preview });

  // The default privacy policy requires approval; serving silently is a bug.
  const response = await dispatchAgentRpc(service, {
    id: 1,
    method: "memory.get_context_bundle",
    params: { projectId: project.id }
  });
  assert.equal(response.ok, true);
  const result = response.result as { status: string; approvalRef?: string; sections?: unknown[] };
  assert.equal(result.status, "approval_required");
  assert.match(result.approvalRef ?? "", /^zharwing-approval-[0-9a-f]{16}$/);
  assert.equal(result.sections, undefined, "approval_required must not carry content");
});

test("agent bundle projection drops paths, excluded titles, and redaction details", () => {
  const bundle: ContextBundle = {
    id: "bundle-1" as ContextBundle["id"],
    projectId: "project-1" as ContextBundle["projectId"],
    created: new Date().toISOString() as ContextBundle["created"],
    includedItems: [
      {
        id: "item-1",
        projectId: "project-1" as never,
        type: "document",
        title: "Public note",
        sourcePath: "/home/user/secret-location/MARKER_SOURCE_PATH.md",
        visibility: "ai-eligible",
        reason: "pinned",
        mode: "raw",
        content: "Safe content the agent may see.",
        tokenEstimate: 10
      }
    ],
    excludedItems: [
      {
        id: "item-2",
        type: "document",
        title: "MARKER_EXCLUDED_TITLE",
        sourcePath: "/home/user/MARKER_EXCLUDED_PATH.md",
        reason: "never-send"
      }
    ],
    redactions: [{ itemId: "item-1", pattern: "MARKER_REDACTION_PATTERN", count: 1 } as never],
    tokenEstimate: 10,
    safetyStatus: "clean",
    auditLogPath: "/home/user/MARKER_AUDIT_PATH.log",
    markdown: "irrelevant for agents"
  };
  const projected = projectBundleForAgent(bundle, { maxTokens: 4000 });
  const markers = ["MARKER_SOURCE_PATH", "MARKER_EXCLUDED_TITLE", "MARKER_EXCLUDED_PATH", "MARKER_REDACTION_PATTERN", "MARKER_AUDIT_PATH"];
  assert.deepEqual(scanForMarkers(projected, markers), []);
  assert.equal(projected.excludedCount, 1);
  assert.equal(projected.redactionsCount, 1);
  assert.equal(projected.sections.length, 1);
  assert.equal(projected.sections[0].content, "Safe content the agent may see.");
});

test("agent bundle enforces the token budget and reports truncation", () => {
  const items = Array.from({ length: 10 }, (_, index) => ({
    id: `item-${index}`,
    projectId: "project-1" as never,
    type: "document" as const,
    title: `Note ${index}`,
    visibility: "ai-eligible" as const,
    reason: "recent",
    mode: "raw" as const,
    content: "word ".repeat(400),
    tokenEstimate: 100
  }));
  const bundle = {
    id: "bundle-2",
    projectId: "project-1",
    created: new Date().toISOString(),
    includedItems: items,
    excludedItems: [],
    redactions: [],
    tokenEstimate: 1000,
    safetyStatus: "clean",
    markdown: ""
  } as unknown as ContextBundle;
  const projected = projectBundleForAgent(bundle, { maxTokens: 350, idempotencyKey: "task-1:attempt-1" });
  assert.equal(projected.budget.truncated, true);
  assert.ok(projected.budget.usedTokens <= 350);
  assert.equal(projected.sections.length, 3);
  assert.equal(projected.idempotencyKey, "task-1:attempt-1");
});

test("errors through the facade are sanitized: no stacks, no filesystem paths", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const response = await dispatchAgentRpc(service, {
    id: 1,
    method: "memory.get_context_bundle",
    params: { projectId: "project-that-does-not-exist" }
  });
  assert.equal(response.ok, false);
  const serialized = JSON.stringify(response);
  assert.ok(!serialized.includes(memoryRoot), "error must not leak the memory root path");
  assert.ok(!serialized.includes("at "), "error must not include a stack trace");
  assert.equal(response.error?.stack, undefined);
});

test("end to end: a real project with secret markers never leaks them to agents", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({ projectName: "Facade Markers", createPointerFile: false });
  const project = await service.createProject({ preview });
  await service.createDocument({
    projectId: project.id,
    title: "Visible note",
    type: "scratch-note",
    visibility: "ai-pinned",
    body: "SAFE_VISIBLE_CONTENT"
  });
  await service.createDocument({
    projectId: project.id,
    title: "MARKER_PRIVATE_TITLE",
    type: "scratch-note",
    visibility: "never-send",
    body: "MARKER_PRIVATE_BODY"
  });

  const stubbed = new Proxy(service, {
    get(target, property, receiver) {
      if (property === "getProject") {
        return async (projectId: string) => {
          const record = await target.getProject(projectId);
          if (!record) return record;
          return {
            ...record,
            privacyPolicy: { ...record.privacyPolicy, requireApprovalBeforeServingContext: false }
          };
        };
      }
      return Reflect.get(target, property, receiver);
    }
  });

  const response = await dispatchAgentRpc(stubbed as MemoryService, {
    id: 1,
    method: "memory.get_context_bundle",
    params: { projectId: project.id, taskText: "visible note" }
  });
  assert.equal(response.ok, true);
  const markers = ["MARKER_PRIVATE_TITLE", "MARKER_PRIVATE_BODY", memoryRoot];
  assert.deepEqual(scanForMarkers(response, markers), []);
  const bundle = response.result as { status: string; sections: Array<{ content: string }> };
  assert.equal(bundle.status, "ok");
  assert.ok(bundle.sections.some((section) => section.content.includes("SAFE_VISIBLE_CONTENT")));
});
