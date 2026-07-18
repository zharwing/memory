import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { MemoryService } from "../memory-service.js";

test("MemoryService runs a project session and memory update lifecycle", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({
    projectName: "Daemon Lifecycle",
    createPointerFile: false
  });
  const project = await service.createProject({ preview });

  const initialState = await service.getStartupState({
    projectId: project.id,
    workingDirectory: memoryRoot,
    clientName: "node-test"
  });
  assert.equal(initialState.projectStatus, "resolved");
  assert.equal(initialState.contextReadiness, "needs-session");

  const session = await service.startSession({
    projectId: project.id,
    workingDirectory: memoryRoot,
    taskTitle: "Exercise daemon lifecycle",
    agent: "node-test"
  });
  assert.equal(session.status, "active");

  const checkpointed = await service.saveCheckpoint({
    projectId: project.id,
    sessionId: session.id,
    summary: "Saved lifecycle checkpoint.",
    nextSteps: ["Close the session."],
    touchedFiles: ["apps/daemon/src/memory-service.ts"]
  });
  assert.equal(checkpointed.checkpoints.length, 1);

  const closed = await service.closeSession({
    projectId: project.id,
    sessionId: session.id,
    summary: "Lifecycle completed.",
    nextSteps: ["Review inbox proposal."]
  });
  assert.equal(closed.status, "closed");

  const doc = await service.createDocument({
    projectId: project.id,
    title: "Lifecycle Context Note",
    type: "scratch-note",
    visibility: "ai-pinned",
    body: "LIFECYCLE_CONTEXT_MARKER"
  });
  const bundle = await service.previewContextBundle({
    projectId: project.id,
    taskText: "lifecycle context"
  });
  assert.equal(bundle.markdown.includes("LIFECYCLE_CONTEXT_MARKER"), true);

  const policy = await service.updateMemoryWritePolicy({
    projectId: project.id,
    reviewMode: "all"
  });
  assert.equal(policy.allowAgentDirectWrites, false);
  await assert.rejects(
    service.createDocument({
      projectId: project.id,
      title: "Blocked Direct Write",
      type: "scratch-note",
      body: "This write should require review."
    }),
    /Direct memory writes are disabled/
  );

  await service.updateMemoryWritePolicy({
    projectId: project.id,
    reviewMode: "off",
    allowAgentDirectWrites: true
  });
  const proposal = await service.proposeMemoryUpdate({
    projectId: project.id,
    type: "doc-update",
    sourceKind: "external-ai",
    sourceAgent: "node-test",
    confidence: "medium",
    targetDocument: doc.id,
    affectedFiles: [doc.filePath],
    proposedPatch: "Add reviewed lifecycle note.",
    reason: "Exercise Memory Inbox proposal flow."
  });
  const inbox = await service.listInbox({ projectId: project.id });
  assert.equal(inbox.some((item) => item.id === proposal.id && item.status === "pending"), true);

  const latest = await service.getLatestSession({ projectId: project.id });
  assert.equal(latest?.id, session.id);
  assert.equal(latest?.status, "closed");
});

async function tempMemoryRoot(t: TestContext): Promise<string> {
  const memoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-daemon-test-"));
  t.after(() => fs.rm(memoryRoot, { recursive: true, force: true }));
  return memoryRoot;
}
