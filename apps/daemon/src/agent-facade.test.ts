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
      found.push(...scanForMarkers(entry, markers, `${where}.${key}`));
    }
  }
  return found;
}

test("every RPC method is classified: MCP-supported or control-plane-only", async () => {
  const source = await fs.readFile(RPC_SOURCE, "utf8");
  const methods = [...new Set([...source.matchAll(/case "(memory\.[a-z_]+)"/g)].map((match) => match[1]))];
  assert.ok(methods.length > 50, `expected the full RPC inventory, found ${methods.length}`);
  const service = {} as MemoryService;
  for (const method of methods) {
    if (isAgentSafeMethod(method)) continue;
    const response = await dispatchAgentRpc(service, { id: 1, method, params: {} });
    assert.equal(response.ok, false, `${method} must be denied through MCP`);
    assert.match(response.error?.message ?? "", /CONTROL_PLANE_ONLY/, method);
  }
});

test("unknown and future methods are denied by default", async () => {
  const response = await dispatchAgentRpc({} as MemoryService, { id: 1, method: "memory.brand_new_method" });
  assert.equal(response.ok, false);
  assert.match(response.error?.message ?? "", /CONTROL_PLANE_ONLY/);
});

test("the MCP surface exposes exactly the daily AI memory loop", () => {
  assert.deepEqual(agentSafeMethods().sort(), [
    "memory.close_session",
    "memory.get_context_bundle",
    "memory.get_latest_session",
    "memory.get_recent_sessions",
    "memory.get_startup_state",
    "memory.health",
    "memory.preview_context_bundle",
    "memory.save_checkpoint",
    "memory.search",
    "memory.start_session"
  ]);
});

test("agent health is minimal", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const response = await dispatchAgentRpc(service, { id: 1, method: "memory.health" });
  assert.equal(response.ok, true);
  assert.deepEqual(response.result, { status: "ok" });
});

test("MCP supports the complete startup, session, checkpoint, and closeout loop", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({ projectName: "Daily Memory", createPointerFile: false });
  const project = await service.createProject({ preview });

  const started = await dispatchAgentRpc(service, {
    id: 1,
    method: "memory.start_session",
    params: { projectId: project.id, taskTitle: "Ship the MCP loop", agent: "codex" }
  });
  assert.equal(started.ok, true);
  const session = started.result as { id: string; filePath: string; taskTitle: string };
  assert.equal(session.taskTitle, "Ship the MCP loop");
  assert.ok(session.filePath.includes(memoryRoot), "normal memory paths should be visible to the coding agent");

  const checkpoint = await dispatchAgentRpc(service, {
    id: 2,
    method: "memory.save_checkpoint",
    params: {
      projectId: project.id,
      sessionId: session.id,
      summary: "Startup and session creation work.",
      touchedFiles: ["apps/daemon/src/agent-facade.ts"],
      nextSteps: ["Finish closeout"]
    }
  });
  assert.equal(checkpoint.ok, true);

  const startup = await dispatchAgentRpc(service, {
    id: 3,
    method: "memory.get_startup_state",
    params: { projectId: project.id, clientName: "codex" }
  });
  assert.equal(startup.ok, true);
  assert.equal((startup.result as any).project.id, project.id);
  assert.equal((startup.result as any).activeSession.id, session.id);

  const latest = await dispatchAgentRpc(service, {
    id: 4,
    method: "memory.get_latest_session",
    params: { projectId: project.id }
  });
  assert.equal((latest.result as any).id, session.id);

  const recent = await dispatchAgentRpc(service, {
    id: 5,
    method: "memory.get_recent_sessions",
    params: { projectId: project.id, limit: 1 }
  });
  assert.deepEqual((recent.result as any[]).map((item) => item.id), [session.id]);

  const closed = await dispatchAgentRpc(service, {
    id: 6,
    method: "memory.close_session",
    params: { projectId: project.id, sessionId: session.id, summary: "MCP loop complete.", autoSummarize: false }
  });
  assert.equal(closed.ok, true);
  assert.equal((closed.result as any).status, "closed");
});

test("AI-visible memory is searchable by default while explicit exclusions stay excluded", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({ projectName: "Search Memory", createPointerFile: false });
  const project = await service.createProject({ preview });
  await service.createDocument({
    projectId: project.id,
    title: "Visible implementation note",
    type: "scratch-note",
    visibility: "ai-eligible",
    body: "FINDABLE_MEMORY default visible content"
  });
  await service.createDocument({
    projectId: project.id,
    title: "Explicit exclusion",
    type: "scratch-note",
    visibility: "never-send",
    body: "FINDABLE_MEMORY MARKER_NEVER_SEND_BODY"
  });

  const response = await dispatchAgentRpc(service, {
    id: 1,
    method: "memory.search",
    params: { projectId: project.id, query: "FINDABLE_MEMORY" }
  });
  assert.equal(response.ok, true);
  const serialized = JSON.stringify(response.result);
  assert.match(serialized, /default visible content/);
  assert.doesNotMatch(serialized, /MARKER_NEVER_SEND_BODY/);
  assert.ok((response.result as any[]).some((result) => result.path?.includes(memoryRoot)));
});

test("context is available by default and includes useful source paths", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({ projectName: "Context Memory", createPointerFile: false });
  const project = await service.createProject({ preview });
  assert.equal(project.privacyPolicy.requireApprovalBeforeServingContext, false);
  await service.createDocument({
    projectId: project.id,
    title: "Pinned conventions",
    type: "scratch-note",
    visibility: "ai-pinned",
    body: "VISIBLE_CONTEXT_CONTENT"
  });

  const response = await dispatchAgentRpc(service, {
    id: 1,
    method: "memory.get_context_bundle",
    params: { projectId: project.id, taskText: "conventions" }
  });
  assert.equal(response.ok, true);
  const bundle = response.result as { status: string; sections: Array<{ content: string; sourcePath?: string }> };
  assert.equal(bundle.status, "ok");
  const section = bundle.sections.find((item) => item.content.includes("VISIBLE_CONTEXT_CONTENT"));
  assert.ok(section);
  assert.ok(section.sourcePath?.includes(memoryRoot));
});

test("agent bundle keeps included paths but drops details about excluded memory", () => {
  const bundle: ContextBundle = {
    id: "bundle-1" as ContextBundle["id"],
    projectId: "project-1" as ContextBundle["projectId"],
    created: new Date().toISOString() as ContextBundle["created"],
    includedItems: [{
      id: "item-1",
      projectId: "project-1" as never,
      type: "document",
      title: "Visible note",
      sourcePath: "/repo/docs/visible-note.md",
      visibility: "ai-eligible",
      reason: "relevant",
      mode: "raw",
      content: "Safe content the agent may see.",
      tokenEstimate: 10
    }],
    excludedItems: [{
      id: "item-2",
      type: "document",
      title: "MARKER_EXCLUDED_TITLE",
      sourcePath: "/repo/MARKER_EXCLUDED_PATH.md",
      reason: "never-send"
    }],
    redactions: [{ itemId: "item-1", pattern: "MARKER_REDACTION_PATTERN", count: 1 } as never],
    tokenEstimate: 10,
    safetyStatus: "clean",
    auditLogPath: "/repo/MARKER_AUDIT_PATH.log",
    markdown: "irrelevant for agents"
  };
  const projected = projectBundleForAgent(bundle, { maxTokens: 4000 });
  assert.equal(projected.sections[0].sourcePath, "/repo/docs/visible-note.md");
  assert.deepEqual(scanForMarkers(projected, [
    "MARKER_EXCLUDED_TITLE",
    "MARKER_EXCLUDED_PATH",
    "MARKER_REDACTION_PATTERN",
    "MARKER_AUDIT_PATH"
  ]), []);
});

test("agent bundle enforces the token budget and reports truncation", () => {
  const items = Array.from({ length: 10 }, (_, index) => ({
    id: `item-${index}`,
    projectId: "project-1" as never,
    type: "document" as const,
    title: `Note ${index}`,
    sourcePath: `/repo/note-${index}.md`,
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

test("errors through the MCP facade are sanitized", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const response = await dispatchAgentRpc(service, {
    id: 1,
    method: "memory.get_latest_session",
    params: { projectId: "project-that-does-not-exist" }
  });
  assert.equal(response.ok, false);
  const serialized = JSON.stringify(response);
  assert.ok(!serialized.includes(memoryRoot));
  assert.ok(!serialized.includes("at "));
  assert.equal(response.error?.stack, undefined);
});
