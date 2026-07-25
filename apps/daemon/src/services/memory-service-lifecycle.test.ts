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
  if (initialState.notModified) assert.fail("initial startup must return a snapshot");
  assert.equal(initialState.projectStatus, "resolved");
  assert.equal(initialState.contextReadiness, "needs-session");

  const session = await service.startSession({
    projectId: project.id,
    workingDirectory: memoryRoot,
    taskTitle: "Exercise daemon lifecycle",
    agent: "node-test"
  });
  assert.equal(session.status, "active");
  assert.equal(session.includeInGraph, false);

  const graphIncluded = await service.updateSessionGraphVisibility({
    projectId: project.id,
    sessionId: session.id,
    includeInGraph: true
  });
  assert.equal(graphIncluded.includeInGraph, true);

  const workstream = await service.createWorkstream({
    projectId: project.id,
    name: "Lifecycle Lane"
  });
  const closedWorkstream = await service.createWorkstream({
    projectId: project.id,
    name: "Finished Lane"
  });
  await service.updateWorkstreamStatus({
    projectId: project.id,
    workstreamId: closedWorkstream.id,
    status: "done"
  });
  const stateWithWorkstreams = await service.getStartupState({
    projectId: project.id,
    workingDirectory: memoryRoot,
    clientName: "node-test"
  });
  if (stateWithWorkstreams.notModified) assert.fail("startup must return a snapshot");
  assert.equal(stateWithWorkstreams.workstreams.some((entry) => entry.id === workstream.id), true);
  assert.equal(stateWithWorkstreams.workstreams.some((entry) => entry.id === closedWorkstream.id), false);

  const checkpointed = await service.saveCheckpoint({
    projectId: project.id,
    sessionId: session.id,
    summary: "Saved lifecycle checkpoint.",
    nextSteps: ["Close the session."],
    touchedFiles: ["apps/daemon/src/memory-service.ts"],
    workstreamIds: [workstream.id]
  });
  assert.equal(checkpointed.checkpoints.length, 1);
  assert.deepEqual(checkpointed.workstreamIds, [workstream.id]);

  const closed = await service.closeSession({
    projectId: project.id,
    sessionId: session.id,
    summary: "Lifecycle completed.",
    nextSteps: ["Review inbox proposal."],
    workstreamIds: [workstream.id]
  });
  assert.equal(closed.status, "closed");
  assert.deepEqual(closed.workstreamIds, [workstream.id]);

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

test("startup stays compact, supports revision validation, and pages explicit detail", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({
    projectName: "Pathological Startup",
    createPointerFile: false
  });
  const project = await service.createProject({ preview });
  const session = await service.startSession({
    projectId: project.id,
    workingDirectory: memoryRoot,
    taskTitle: "Large checkpoint history"
  });

  for (let index = 0; index < 220; index += 1) {
    await service.saveCheckpoint({
      projectId: project.id,
      sessionId: session.id,
      summary: `Checkpoint ${index}: ${"history ".repeat(20)}`,
      nextSteps: [`Current step ${index}`],
      blockers: index === 219 ? [] : [`Old blocker ${index}`],
      touchedFiles: [`src/file-${index}.ts`]
    });
  }

  const startup = await service.getStartupState({ projectId: project.id });
  if (startup.notModified) assert.fail("initial startup must return a snapshot");
  const serialized = JSON.stringify(startup);
  assert.ok(Buffer.byteLength(serialized, "utf8") < 16 * 1024);
  assert.doesNotMatch(serialized, /"body":/);
  assert.doesNotMatch(serialized, /"checkpoints":/);
  const carryForward = startup.activeSession || startup.latestSession;
  assert.equal(carryForward?.checkpointCount, 220);
  assert.deepEqual(carryForward?.nextSteps, ["Current step 219"]);
  assert.deepEqual(carryForward?.blockers, []);
  assert.equal(carryForward?.totalTouchedFiles, 220);
  assert.equal(carryForward?.touchedFiles.length, 10);

  const unchanged = await service.getStartupState({
    projectId: project.id,
    knownRevision: startup.revision
  });
  assert.equal(unchanged.notModified, true);
  assert.deepEqual(Object.keys(unchanged).sort(), [
    "notModified",
    "projectId",
    "revision",
    "schema",
    "sessionId"
  ]);

  const firstPage = await service.getSessionDetail({
    projectId: project.id,
    sessionId: session.id,
    sections: ["checkpoints"],
    checkpointLimit: 50
  });
  assert.equal(firstPage.checkpoints?.length, 50);
  assert.ok(firstPage.nextCursor);
  assert.equal(firstPage.checkpoints?.[0]?.summary.startsWith("Checkpoint 219"), true);

  const secondPage = await service.getSessionDetail({
    projectId: project.id,
    sessionId: session.id,
    sections: ["checkpoints"],
    checkpointLimit: 50,
    cursor: firstPage.nextCursor
  });
  assert.equal(secondPage.checkpoints?.length, 50);
  assert.equal(secondPage.checkpoints?.[0]?.summary.startsWith("Checkpoint 169"), true);

  const body = await service.getSessionDetail({
    projectId: project.id,
    sessionId: session.id,
    sections: ["body"]
  });
  assert.match(body.body || "", /Checkpoint 219/);
  assert.equal(body.checkpoints, undefined);
});

async function tempMemoryRoot(t: TestContext): Promise<string> {
  const memoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-daemon-test-"));
  t.after(() => fs.rm(memoryRoot, { recursive: true, force: true }));
  return memoryRoot;
}
