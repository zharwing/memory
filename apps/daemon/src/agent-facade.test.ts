import assert from "node:assert/strict";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import {
  OPERATION_REGISTRY,
  markPrincipalAuthenticated,
  type ContextBundle,
  type OperationName,
  type PublicError
} from "@zharwing/memory-core";
import {
  getSession,
  listProjectSessionSummaries,
  updateSessionSummary
} from "@zharwing/memory-store";
import {
  agentSafeMethods,
  dispatchAgentRpc,
  dispatchAuthorizedAgentRpc,
  isAgentSafeMethod,
  projectBundleForAgent
} from "./agent-facade.js";
import { MemoryService } from "./memory-service.js";
import type { RpcResponse } from "./rpc.js";
import type { AuthorizedInvocation } from "./services/operation-registrar.js";
import { SessionAuthorityStore } from "./services/session-visibility.js";

/**
 * The shared RpcResponse is a discriminated union; these tests inspect both
 * branches without narrowing, so widen to the permissive envelope shape.
 */
function envelope(response: RpcResponse): {
  id?: string | number;
  ok: boolean;
  result?: unknown;
  error?: PublicError;
} {
  return response;
}

async function tempMemoryRoot(t: TestContext): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-facade-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

function agentInvocation<Name extends OperationName>(
  name: Name,
  input: Record<string, unknown>,
  projectId?: string,
  id = 1
): AuthorizedInvocation<Name> {
  return {
    requestId: id,
    name,
    input: input as AuthorizedInvocation<Name>["input"],
    principal: markPrincipalAuthenticated({
      principalId: "synthetic-agent",
      sessionId: "synthetic-agent-session",
      sessionOwner: "agent-facade-test",
      audience: "agent",
      operations: agentSafeMethods() as OperationName[],
      projectId: projectId ?? null,
      issuedAt: "2026-08-12T10:00:00.000Z",
      expiresAt: "2026-08-12T11:00:00.000Z",
      authorityEpoch: 1,
      policyDigest: "sha256:synthetic-policy",
      rotationId: "synthetic-rotation",
      revocationId: "synthetic-revocation"
    }),
    ...(projectId ? { projectId } : {})
  };
}

function escapedRegExp(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
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
  const methods = Object.keys(OPERATION_REGISTRY);
  assert.ok(methods.length > 50, `expected the full RPC inventory, found ${methods.length}`);
  const service = {} as MemoryService;
  for (const method of methods) {
    if (isAgentSafeMethod(method)) continue;
    const response = envelope(await dispatchAgentRpc(service, { id: 1, method, params: {} }));
    assert.equal(response.ok, false, `${method} must be denied through MCP`);
    assert.equal(response.error?.code, "forbidden", method);
    assert.equal(response.error?.messageId, "operation.forbidden", method);
  }
});

test("unknown and future methods are denied by default", async () => {
  const response = envelope(await dispatchAgentRpc({} as MemoryService, { id: 1, method: "memory.brand_new_method" }));
  assert.equal(response.ok, false);
  assert.equal(response.error?.code, "forbidden");
  assert.equal(response.error?.messageId, "operation.forbidden");
});

test("the MCP surface exposes exactly the daily AI memory loop", () => {
  assert.deepEqual(agentSafeMethods().sort(), [
    "memory.close_session",
    "memory.get_context_bundle",
    "memory.get_latest_session",
    "memory.get_recent_sessions",
    "memory.get_session_detail",
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
  const response = envelope(await dispatchAgentRpc(service, { id: 1, method: "memory.health" }));
  assert.equal(response.ok, true);
  assert.deepEqual(response.result, { status: "ok" });
});

test("MCP supports the complete startup, session, checkpoint, and closeout loop", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({ projectName: "Daily Memory", createPointerFile: false });
  const project = await service.createProject({ preview });

  const started = envelope(await dispatchAgentRpc(service, {
    id: 1,
    method: "memory.start_session",
    params: { projectId: project.id, taskTitle: "Ship the MCP loop", agent: "codex" }
  }));
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

  const startup = envelope(await dispatchAgentRpc(service, {
    id: 3,
    method: "memory.get_startup_state",
    params: { projectId: project.id, clientName: "codex" }
  }));
  assert.equal(startup.ok, true);
  assert.equal((startup.result as any).project.id, project.id);
  assert.equal((startup.result as any).activeSession.id, session.id);
  assert.equal("body" in (startup.result as any).activeSession, false);
  assert.equal("checkpoints" in (startup.result as any).activeSession, false);

  const latest = envelope(await dispatchAgentRpc(service, {
    id: 4,
    method: "memory.get_latest_session",
    params: { projectId: project.id }
  }));
  assert.equal((latest.result as any).id, session.id);

  const recent = envelope(await dispatchAgentRpc(service, {
    id: 5,
    method: "memory.get_recent_sessions",
    params: { projectId: project.id, limit: 1 }
  }));
  assert.deepEqual((recent.result as any[]).map((item) => item.id), [session.id]);

  const detail = envelope(await dispatchAgentRpc(service, {
    id: 6,
    method: "memory.get_session_detail",
    params: {
      projectId: project.id,
      sessionId: session.id,
      sections: ["body", "checkpoints"],
      checkpointLimit: 1
    }
  }));
  assert.equal(detail.ok, true);
  assert.match((detail.result as any).body, /Startup and session creation work/);
  assert.equal((detail.result as any).checkpoints.length, 1);

  const closed = envelope(await dispatchAgentRpc(service, {
    id: 7,
    method: "memory.close_session",
    params: { projectId: project.id, sessionId: session.id, summary: "MCP loop complete.", autoSummarize: false }
  }));
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

  const response = envelope(await dispatchAgentRpc(service, {
    id: 1,
    method: "memory.search",
    params: { projectId: project.id, query: "FINDABLE_MEMORY" }
  }));
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

  const response = envelope(await dispatchAgentRpc(service, {
    id: 1,
    method: "memory.get_context_bundle",
    params: { projectId: project.id, taskText: "conventions" }
  }));
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
  const response = envelope(await dispatchAgentRpc(service, {
    id: 1,
    method: "memory.get_latest_session",
    params: { projectId: "project-that-does-not-exist" }
  }));
  assert.equal(response.ok, false);
  const serialized = JSON.stringify(response);
  assert.ok(!serialized.includes(memoryRoot));
  assert.ok(!serialized.includes("at "));
  assert.equal(Object.hasOwn(response.error ?? {}, "stack"), false);
});

test("hardened agent facade requires registrar authority and projects every result", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({ projectName: "Hardened Memory", createPointerFile: false });
  const project = await service.createProject({ preview });
  await service.createDocument({
    projectId: project.id,
    title: "Hardened visible canary",
    type: "scratch-note",
    visibility: "ai-eligible",
    body: "VISIBLE_HARDENED_CONTENT"
  });
  await service.createDocument({
    projectId: project.id,
    title: "Private canary title",
    type: "scratch-note",
    visibility: "never-send",
    body: "PRIVATE_HARDENED_CANARY"
  });

  const result = envelope(await dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.search", {
      projectId: project.id,
      query: "HARDENED"
    }, project.id)
  ));
  assert.equal(result.ok, true);
  const serialized = JSON.stringify(result.result);
  assert.match(serialized, /VISIBLE_HARDENED_CONTENT/);
  assert.doesNotMatch(serialized, /PRIVATE_HARDENED_CANARY/);
  assert.doesNotMatch(serialized, /Private canary title/);
  assert.doesNotMatch(serialized, escapedRegExp(memoryRoot));
  assert.doesNotMatch(serialized, /synthetic-agent-session|sha256:synthetic-policy/);
  assert.equal((result.result as any).schema, "zharwing.agent-projection.v1");
  assert.equal((result.result as any).completeness.status, "partial");

  const wrongProject = envelope(await dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.search", { projectId: project.id, query: "HARDENED" }, "other-project")
  ));
  assert.equal(wrongProject.ok, false);
});

test("a projected future search field fails closed at the daemon boundary", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({
    projectName: "Future Field Boundary",
    createPointerFile: false
  });
  const project = await service.createProject({ preview });
  (service as unknown as { search: () => Promise<unknown[]> }).search = async () => [{
    id: "doc-future",
    projectId: project.id,
    type: "document",
    title: "Safe public title",
    visibility: "ai-eligible",
    snippet: "Safe public snippet",
    score: 1,
    futurePrivateField: "DAEMON_FUTURE_PRIVATE_CANARY"
  }];

  const response = envelope(await dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.search", {
      projectId: project.id,
      query: "safe"
    }, project.id)
  ));
  assert.equal(response.ok, false);
  assert.doesNotMatch(JSON.stringify(response), /DAEMON_FUTURE_PRIVATE_CANARY|futurePrivateField/);
});

test("hardened context output is rebuilt and cannot replay the raw markdown or exclusion ledger", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({ projectName: "Bundle Privacy", createPointerFile: false });
  const project = await service.createProject({ preview });
  await service.createDocument({
    projectId: project.id,
    title: "Visible bundle note",
    type: "scratch-note",
    visibility: "ai-pinned",
    body: "VISIBLE_BUNDLE_CANARY"
  });
  await service.createDocument({
    projectId: project.id,
    title: "SECRET_EXCLUSION_TITLE",
    type: "scratch-note",
    visibility: "never-send",
    body: "SECRET_EXCLUSION_BODY"
  });

  const result = envelope(await dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.preview_context_bundle", {
      projectId: project.id,
      taskText: "bundle canary"
    }, project.id)
  ));
  assert.equal(result.ok, true);
  const serialized = JSON.stringify(result.result);
  assert.match(serialized, /VISIBLE_BUNDLE_CANARY/);
  assert.doesNotMatch(serialized, /SECRET_EXCLUSION_TITLE|SECRET_EXCLUSION_BODY/);
  assert.doesNotMatch(serialized, /auditLogPath|markdown|"excluded":/);
  assert.doesNotMatch(serialized, escapedRegExp(memoryRoot));
  assert.equal((result.result as any).completeness.status, "partial");
  assert.equal(Number.isFinite((result.result as any).completeness.excludedItems), true);
});

test("hardened agent writes classify only their owned session records", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const authorityStateRoot = path.join(path.dirname(memoryRoot), `${path.basename(memoryRoot)}-authority`);
  t.after(() => fs.rm(authorityStateRoot, { recursive: true, force: true }));
  const authorityKey = Buffer.alloc(32, 7);
  const service = new MemoryService({ memoryRoot, authorityStateRoot, authorityKey });
  const preview = await service.prepareProjectCreation({ projectName: "Agent Ownership", createPointerFile: false });
  const project = await service.createProject({ preview });

  const legacy = await service.startSession({
    projectId: project.id,
    taskTitle: "LEGACY_HUMAN_SESSION_CANARY",
    client: "human-preview"
  });
  assert.equal(legacy.visibility, undefined);

  const started = envelope(await dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.start_session", {
      projectId: project.id,
      taskTitle: "AGENT_OWNED_SESSION_CANARY",
      agent: "codex"
    }, project.id)
  ));
  assert.equal(started.ok, true);
  assert.equal((started.result as any).schema, "zharwing.agent-projection.v1");
  const startedId = (started.result as any).data.id as string;
  const ownedDetail = await service.getSessionDetail({
    projectId: project.id,
    sessionId: startedId,
    sections: ["body", "checkpoints"]
  });
  assert.equal(ownedDetail.session.visibility, "ai-eligible");

  const restartedService = new MemoryService({ memoryRoot, authorityStateRoot, authorityKey });
  const restartedDetail = await restartedService.getSessionDetail({
    projectId: project.id,
    sessionId: startedId
  });
  assert.equal(restartedDetail.session.visibility, "ai-eligible");

  const legacyCheckpoint = envelope(await dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.save_checkpoint", {
      projectId: project.id,
      sessionId: legacy.id,
      summary: "Agent note on a legacy session"
    }, project.id)
  ));
  assert.equal(legacyCheckpoint.ok, false);

  const legacyClose = envelope(await dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.close_session", {
      projectId: project.id,
      sessionId: legacy.id,
      summary: "must not close a human session",
      autoSummarize: false
    }, project.id)
  ));
  assert.equal(legacyClose.ok, false);

  const ownedCheckpoint = envelope(await dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.save_checkpoint", {
      projectId: project.id,
      sessionId: startedId,
      summary: "Agent-owned checkpoint"
    }, project.id)
  ));
  assert.equal(ownedCheckpoint.ok, true);
  const legacyDetail = await service.getSessionDetail({
    projectId: project.id,
    sessionId: legacy.id,
    sections: ["body", "checkpoints"]
  });
  // Missing persisted visibility remains fail-closed; the agent checkpoint
  // does not upgrade the legacy session disclosure unit.
  assert.equal(legacyDetail.session.visibility, undefined);
  assert.equal(legacyDetail.checkpoints?.at(-1)?.visibility, undefined);

  const context = envelope(await dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.preview_context_bundle", {
      projectId: project.id,
      taskText: "session visibility canary"
    }, project.id)
  ));
  assert.equal(context.ok, true);
  const serialized = JSON.stringify(context.result);
  assert.match(serialized, /AGENT_OWNED_SESSION_CANARY/);
  assert.doesNotMatch(serialized, /LEGACY_HUMAN_SESSION_CANARY/);
  assert.doesNotMatch(serialized, escapedRegExp(memoryRoot));

  const search = envelope(await dispatchAuthorizedAgentRpc(
    restartedService,
    agentInvocation("memory.search", {
      projectId: project.id,
      query: "SESSION_CANARY"
    }, project.id)
  ));
  assert.equal(search.ok, true);
  const searchJson = JSON.stringify(search.result);
  assert.match(searchJson, /AGENT_OWNED_SESSION_CANARY/);
  assert.doesNotMatch(searchJson, /LEGACY_HUMAN_SESSION_CANARY/);

  const ownedRead = envelope(await dispatchAuthorizedAgentRpc(
    restartedService,
    agentInvocation("memory.get_session_detail", {
      projectId: project.id,
      sessionId: startedId,
      sections: ["body", "checkpoints"]
    }, project.id)
  ));
  assert.equal(ownedRead.ok, true);
  assert.match(JSON.stringify(ownedRead.result), /AGENT_OWNED_SESSION_CANARY/);

  await service.saveCheckpoint({
    projectId: project.id,
    sessionId: startedId,
    summary: "HUMAN_PRIVATE_CANARY"
  });
  const mixedDetail = await service.getSessionDetail({
    projectId: project.id,
    sessionId: startedId,
    sections: ["body", "checkpoints"]
  });
  assert.equal(
    mixedDetail.session.visibility,
    undefined,
    "a later control-plane revision must invalidate the session-level grant"
  );
  assert.equal(
    mixedDetail.checkpoints?.find((checkpoint) =>
      checkpoint.summary.includes("Agent-owned checkpoint")
    )?.visibility,
    "ai-eligible"
  );
  assert.equal(
    mixedDetail.checkpoints?.find((checkpoint) =>
      checkpoint.summary.includes("HUMAN_PRIVATE_CANARY")
    )?.visibility,
    undefined,
    "an unclassified checkpoint must not inherit session visibility"
  );
  assert.match(mixedDetail.body || "", /HUMAN_PRIVATE_CANARY/);

  const agentAfterHumanWrite = envelope(await dispatchAuthorizedAgentRpc(
    restartedService,
    agentInvocation("memory.save_checkpoint", {
      projectId: project.id,
      sessionId: startedId,
      summary: "must not classify over the human revision"
    }, project.id)
  ));
  assert.equal(agentAfterHumanWrite.ok, false);

  const mixedAgentRead = envelope(await dispatchAuthorizedAgentRpc(
    restartedService,
    agentInvocation("memory.get_session_detail", {
      projectId: project.id,
      sessionId: startedId,
      sections: ["body", "checkpoints"]
    }, project.id)
  ));
  assert.equal(mixedAgentRead.ok, false);
  assert.doesNotMatch(JSON.stringify(mixedAgentRead), /HUMAN_PRIVATE_CANARY/);

  const mixedSearch = envelope(await dispatchAuthorizedAgentRpc(
    restartedService,
    agentInvocation("memory.search", {
      projectId: project.id,
      query: "HUMAN_PRIVATE_CANARY"
    }, project.id)
  ));
  assert.equal(mixedSearch.ok, true);
  assert.doesNotMatch(JSON.stringify(mixedSearch.result), /HUMAN_PRIVATE_CANARY/);

  const mixedContext = envelope(await dispatchAuthorizedAgentRpc(
    restartedService,
    agentInvocation("memory.preview_context_bundle", {
      projectId: project.id,
      taskText: "HUMAN_PRIVATE_CANARY"
    }, project.id)
  ));
  assert.equal(mixedContext.ok, true);
  assert.doesNotMatch(JSON.stringify(mixedContext.result), /HUMAN_PRIVATE_CANARY/);

  const legacyRead = envelope(await dispatchAuthorizedAgentRpc(
    restartedService,
    agentInvocation("memory.get_session_detail", {
      projectId: project.id,
      sessionId: legacy.id,
      sections: ["body", "checkpoints"]
    }, project.id)
  ));
  assert.equal(legacyRead.ok, false);

  await fs.appendFile(path.join(authorityStateRoot, "session-authority.jsonl"), `${JSON.stringify({
    schema: "zharwing.session-authority.v3",
    namespace: "0".repeat(64),
    projectGeneration: "0".repeat(64),
    projectId: project.id,
    sessionId: legacy.id,
    owner: "forged-project-content",
    provenance: "agent-start-session",
    sessionRevision: "0".repeat(64),
    summaryRevision: "0".repeat(64),
    visibility: "ai-eligible",
    recordedAt: new Date().toISOString(),
    mac: "0".repeat(64)
  })}\n`, "utf8");
  const corruptLedgerService = new MemoryService({ memoryRoot, authorityStateRoot, authorityKey });
  const failClosed = envelope(await dispatchAuthorizedAgentRpc(
    corruptLedgerService,
    agentInvocation("memory.get_session_detail", {
      projectId: project.id,
      sessionId: startedId,
      sections: ["body"]
    }, project.id)
  ));
  assert.equal(failClosed.ok, false);
});

test("agent session classification fails closed across save and close races", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const authorityStateRoot = path.join(path.dirname(memoryRoot), `${path.basename(memoryRoot)}-authority`);
  t.after(() => fs.rm(authorityStateRoot, { recursive: true, force: true }));
  const service = new MemoryService({
    memoryRoot,
    authorityStateRoot,
    authorityKey: Buffer.alloc(32, 13)
  });
  const preview = await service.prepareProjectCreation({
    projectName: "Session Race",
    createPointerFile: false
  });
  const project = await service.createProject({ preview });

  const startOwned = async (title: string): Promise<string> => {
    const response = envelope(await dispatchAuthorizedAgentRpc(
      service,
      agentInvocation("memory.start_session", {
        projectId: project.id,
        taskTitle: title
      }, project.id)
    ));
    assert.equal(response.ok, true);
    return (response.result as any).data.id as string;
  };
  const originalSaveCheckpoint = service.saveCheckpoint.bind(service);

  const saveSessionId = await startOwned("Save race session");
  let enterSave!: () => void;
  let releaseSave!: () => void;
  const saveEntered = new Promise<void>((resolve) => {
    enterSave = resolve;
  });
  const saveReleased = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  service.saveCheckpoint = async (params) => {
    enterSave();
    await saveReleased;
    return originalSaveCheckpoint(params);
  };
  const pendingAgentSave = dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.save_checkpoint", {
      projectId: project.id,
      sessionId: saveSessionId,
      summary: "agent checkpoint after barrier"
    }, project.id)
  );
  await saveEntered;
  await originalSaveCheckpoint({
    projectId: project.id,
    sessionId: saveSessionId,
    summary: "HUMAN_RACE_CANARY"
  });
  releaseSave();
  const racedSave = envelope(await pendingAgentSave);
  assert.equal(racedSave.ok, false);
  assert.doesNotMatch(JSON.stringify(racedSave), /HUMAN_RACE_CANARY/);
  service.saveCheckpoint = originalSaveCheckpoint;

  const saveDetail = await service.getSessionDetail({
    projectId: project.id,
    sessionId: saveSessionId,
    sections: ["body", "checkpoints"]
  });
  assert.equal(saveDetail.session.visibility, undefined);
  assert.equal(
    saveDetail.checkpoints?.find((checkpoint) =>
      checkpoint.summary === "HUMAN_RACE_CANARY"
    )?.visibility,
    undefined
  );

  const closeSessionId = await startOwned("Close race session");
  const originalCloseSession = service.closeSession.bind(service);
  let enterClose!: () => void;
  let releaseClose!: () => void;
  const closeEntered = new Promise<void>((resolve) => {
    enterClose = resolve;
  });
  const closeReleased = new Promise<void>((resolve) => {
    releaseClose = resolve;
  });
  service.closeSession = async (params) => {
    enterClose();
    await closeReleased;
    return originalCloseSession(params);
  };
  const pendingAgentClose = dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.close_session", {
      projectId: project.id,
      sessionId: closeSessionId,
      summary: "agent close after barrier",
      autoSummarize: false
    }, project.id)
  );
  await closeEntered;
  await originalSaveCheckpoint({
    projectId: project.id,
    sessionId: closeSessionId,
    summary: "HUMAN_RACE_CANARY"
  });
  releaseClose();
  const racedClose = envelope(await pendingAgentClose);
  assert.equal(racedClose.ok, false);
  assert.doesNotMatch(JSON.stringify(racedClose), /HUMAN_RACE_CANARY/);
  service.closeSession = originalCloseSession;

  const closeDetail = await service.getSessionDetail({
    projectId: project.id,
    sessionId: closeSessionId,
    sections: ["body", "checkpoints"]
  });
  assert.equal(closeDetail.session.visibility, undefined);
  assert.equal(
    closeDetail.checkpoints?.find((checkpoint) =>
      checkpoint.summary === "HUMAN_RACE_CANARY"
    )?.visibility,
    undefined
  );

  for (const sessionId of [saveSessionId, closeSessionId]) {
    const agentRead = envelope(await dispatchAuthorizedAgentRpc(
      service,
      agentInvocation("memory.get_session_detail", {
        projectId: project.id,
        sessionId,
        sections: ["body", "checkpoints"]
      }, project.id)
    ));
    assert.equal(agentRead.ok, false);
    assert.doesNotMatch(JSON.stringify(agentRead), /HUMAN_RACE_CANARY/);
  }

  const cleanCloseSessionId = await startOwned("Clean close session");
  const cleanClose = envelope(await dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.close_session", {
      projectId: project.id,
      sessionId: cleanCloseSessionId,
      summary: "agent-only close",
      autoSummarize: true
    }, project.id)
  ));
  assert.equal(cleanClose.ok, true);
  const cleanCloseDetail = await service.getSessionDetail({
    projectId: project.id,
    sessionId: cleanCloseSessionId,
    sections: ["body", "checkpoints"]
  });
  assert.equal(cleanCloseDetail.session.status, "closed");
  assert.equal(cleanCloseDetail.session.visibility, "ai-eligible");
});

test("summary observation race cannot combine stale session and HUMAN_SUMMARY_RACE_CANARY authority", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const authorityStateRoot = path.join(path.dirname(memoryRoot), `${path.basename(memoryRoot)}-authority`);
  t.after(() => fs.rm(authorityStateRoot, { recursive: true, force: true }));
  const authorityKey = Buffer.alloc(32, 17);
  const service = new MemoryService({ memoryRoot, authorityStateRoot, authorityKey });
  const preview = await service.prepareProjectCreation({
    projectName: "Summary Race",
    createPointerFile: false
  });
  const project = await service.createProject({ preview });
  const started = envelope(await dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.start_session", {
      projectId: project.id,
      taskTitle: "Summary race session"
    }, project.id)
  ));
  assert.equal(started.ok, true);
  const sessionId = (started.result as any).data.id as string;

  await service.saveCheckpoint({
    projectId: project.id,
    sessionId,
    summary: "pending agent checkpoint classification"
  });
  const written = await getSession(project, sessionId);
  const observedSummary = (await listProjectSessionSummaries(project))
    .find((candidate) => candidate.id === sessionId);
  assert.ok(written);
  assert.ok(observedSummary);

  const authority = new SessionAuthorityStore({
    stateRoot: authorityStateRoot,
    key: authorityKey,
    namespace: crypto.createHash("sha256")
      .update("zharwing.memory-root.v1\0", "utf8")
      .update(path.resolve(memoryRoot), "utf8")
      .digest("hex")
  });
  await assert.rejects(
    authority.recordAgentOwnedRevision(
      project,
      written,
      observedSummary,
      "agent-facade-test",
      "agent-save-checkpoint",
      async () => {
        await updateSessionSummary({
          project,
          sessionId,
          summary: "HUMAN_SUMMARY_RACE_CANARY",
          summarySource: "manual"
        });
        return getSession(project, sessionId);
      }
    ),
    /changed while authority classification/
  );

  const listed = await service.listSessions({ projectId: project.id });
  const latest = await service.getLatestSession({ projectId: project.id });
  const startup = await service.getStartupState({
    projectId: project.id,
    clientName: "summary-race-test"
  });
  const listedSession = listed.find((candidate) => candidate.id === sessionId);
  assert.equal(listedSession?.summary, "HUMAN_SUMMARY_RACE_CANARY");
  assert.equal(listedSession?.visibility, undefined);
  assert.equal(latest?.summary, "HUMAN_SUMMARY_RACE_CANARY");
  assert.equal(latest?.visibility, undefined);
  for (const value of [
    (startup as any).activeSession,
    (startup as any).latestSession,
    ...((startup as any).recentSessions || [])
  ]) {
    if (value?.id !== sessionId) continue;
    assert.equal(value.summary, "HUMAN_SUMMARY_RACE_CANARY");
    assert.equal(value.visibility, undefined);
  }
});

test("hardened startup returns a bounded projection envelope with truthful completeness", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({ projectName: "PRIVATE_PROJECT_NAME", createPointerFile: false });
  const project = await service.createProject({ preview });
  await service.startSession({
    projectId: project.id,
    taskTitle: "PRIVATE_STARTUP_SESSION_TITLE",
    workingDirectory: memoryRoot
  });

  const startup = envelope(await dispatchAuthorizedAgentRpc(
    service,
    agentInvocation("memory.get_startup_state", {
      projectId: project.id,
      clientName: "codex"
    }, project.id)
  ));
  assert.equal(startup.ok, true);
  const projected = startup.result as any;
  assert.equal(projected.schema, "zharwing.agent-projection.v1");
  assert.equal(projected.completeness.status, "partial");
  assert.equal(projected.data.projectId, project.id);
  assert.deepEqual(projected.data.counts, {
    recentSessionsReturned: 0,
    workstreamsReturned: 0
  });
  const serialized = JSON.stringify(projected);
  assert.doesNotMatch(serialized, /PRIVATE_PROJECT_NAME|PRIVATE_STARTUP_SESSION_TITLE/);
  assert.doesNotMatch(serialized, escapedRegExp(memoryRoot));
  assert.doesNotMatch(serialized, /repoRoot|repoCount|sessionCount/);
});
