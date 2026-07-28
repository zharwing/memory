import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { readSession, writeSession } from "@zharwing/memory-store";
import { MemoryService } from "../memory-service.js";
import { STALE_SESSION_CLOSE_REASON } from "./session-service.js";

test("starting a session auto-closes sessions left active on an earlier day", async (t) => {
  const service = new MemoryService({ memoryRoot: await tempMemoryRoot(t) });
  const project = await createProject(service, "Auto Close Rollover");

  const staleTimestamp = hoursAgo(48);
  const yesterday = await service.startSession({
    projectId: project.id,
    taskTitle: "Yesterday's abandoned work",
    agent: "node-test"
  });
  await backdateSession(yesterday.filePath!, staleTimestamp);

  const today = await service.startSession({
    projectId: project.id,
    taskTitle: "Today's work",
    agent: "node-test"
  });
  assert.equal(today.status, "active");

  const sessions = await service.listSessions({ projectId: project.id });
  const staleRow = sessions.find((session) => session.id === yesterday.id);
  assert.equal(staleRow?.status, "closed");
  assert.equal(staleRow?.closedReason, STALE_SESSION_CLOSE_REASON);
  // The close is housekeeping, not activity: the stale session keeps its own
  // recency so it does not outrank today's session in the list.
  assert.equal(staleRow?.updated, staleTimestamp);
  assert.equal(sessions[0]?.id, today.id);

  // Auto-close still leaves a searchable TLDR behind.
  assert.equal(staleRow?.summarySource, "deterministic");
  assert.ok(staleRow?.summary);

  const active = await service.getActiveSession({ projectId: project.id });
  assert.equal(active?.id, today.id);
});

test("start_or_resume starts a new session instead of resuming a previous day's log", async (t) => {
  const service = new MemoryService({ memoryRoot: await tempMemoryRoot(t) });
  const project = await createProject(service, "Auto Close Resume");

  const yesterday = await service.startOrResumeSession({ projectId: project.id, agent: "node-test" });
  await backdateSession(yesterday.filePath!, hoursAgo(48));

  const resumed = await service.startOrResumeSession({ projectId: project.id, agent: "node-test" });
  assert.notEqual(resumed.id, yesterday.id);
  assert.equal(resumed.status, "active");

  const sameDay = await service.startOrResumeSession({ projectId: project.id, agent: "node-test" });
  assert.equal(sameDay.id, resumed.id);
});

test("startup state stops recommending a previous day's session", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const project = await createProject(service, "Auto Close Startup");

  const session = await service.startSession({
    projectId: project.id,
    taskTitle: "Left open overnight",
    agent: "node-test"
  });

  const sameDay = await service.getStartupState({ projectId: project.id, workingDirectory: memoryRoot });
  if (sameDay.notModified) assert.fail("startup must return a snapshot");
  assert.equal(sameDay.recommendedAction, "resume-active");

  await backdateSession(session.filePath!, hoursAgo(48));

  const nextDay = await service.getStartupState({ projectId: project.id, workingDirectory: memoryRoot });
  if (nextDay.notModified) assert.fail("startup must return a snapshot");
  assert.equal(nextDay.recommendedAction, "start-new");
});

test("auto-close leaves an already summarized session's TLDR untouched", async (t) => {
  const service = new MemoryService({ memoryRoot: await tempMemoryRoot(t) });
  const project = await createProject(service, "Auto Close Summary");

  const yesterday = await service.startSession({
    projectId: project.id,
    taskTitle: "Summarized already",
    agent: "node-test"
  });
  const stored = await readSession(yesterday.filePath!);
  await writeSession({
    ...stored,
    started: hoursAgo(48),
    updated: hoursAgo(48),
    summary: "Hand written TLDR.",
    summaryGeneratedAt: hoursAgo(48),
    summarySource: "manual"
  });

  await service.startSession({ projectId: project.id, taskTitle: "Next day", agent: "node-test" });

  const sessions = await service.listSessions({ projectId: project.id });
  const staleRow = sessions.find((session) => session.id === yesterday.id);
  assert.equal(staleRow?.status, "closed");
  assert.equal(staleRow?.summary, "Hand written TLDR.");
  assert.equal(staleRow?.summarySource, "manual");
});

async function createProject(service: MemoryService, projectName: string) {
  const preview = await service.prepareProjectCreation({ projectName, createPointerFile: false });
  return service.createProject({ preview });
}

async function backdateSession(filePath: string, timestamp: string): Promise<void> {
  const session = await readSession(filePath);
  await writeSession({ ...session, started: timestamp, updated: timestamp });
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function tempMemoryRoot(t: TestContext): Promise<string> {
  const memoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-daemon-test-"));
  t.after(() => fs.rm(memoryRoot, { recursive: true, force: true }));
  return memoryRoot;
}
