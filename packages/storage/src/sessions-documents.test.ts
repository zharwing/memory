import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import {
  ProjectRegistry,
  closeSession,
  createDocument,
  createProjectFromPreview,
  listProjectDocuments,
  listProjectSessions,
  prepareProjectCreation,
  saveCheckpoint,
  startSession,
  writeSession
} from "./index.js";

test("sessions preserve body text while checkpointing and closing", async (t) => {
  const { project } = await createTempProject(t, "Storage Sessions");
  const session = await startSession({
    project,
    repoPath: project.memoryRoot,
    workingDirectory: project.memoryRoot,
    taskTitle: "Verify session round trip",
    agent: "node-test",
    client: "storage-test",
    goal: "Keep Markdown body intact."
  });

  const customBody = [
    "# Custom Session Body",
    "",
    "This body contains a Markdown separator that must survive.",
    "",
    "---",
    "",
    "End of custom body."
  ].join("\n");
  await writeSession({ ...session, body: customBody }, customBody);

  const afterWrite = (await listProjectSessions(project)).find((item) => item.id === session.id);
  assert.ok(afterWrite);
  assert.equal((afterWrite.body || "").includes("Markdown separator that must survive"), true);
  assert.equal((afterWrite.body || "").includes("---"), true);

  const checkpointed = await saveCheckpoint({
    project,
    sessionId: session.id,
    summary: "Checkpoint summary survived.",
    nextSteps: ["Keep testing storage."],
    blockers: ["None"],
    touchedFiles: ["packages/storage/src/sessions.ts"]
  });
  assert.equal(checkpointed.checkpoints.length, 1);
  assert.equal((checkpointed.body || "").includes("Custom Session Body"), true);
  assert.equal((checkpointed.body || "").includes("Checkpoint summary survived."), true);

  const closed = await closeSession({
    project,
    sessionId: session.id,
    summary: "Session closed cleanly.",
    nextSteps: ["Review test output."]
  });
  assert.equal(closed.status, "closed");
  assert.ok(closed.closed);
  assert.equal((closed.body || "").includes("Custom Session Body"), true);
  assert.equal((closed.body || "").includes("Session closed cleanly."), true);

  const listed = (await listProjectSessions(project)).find((item) => item.id === session.id);
  assert.equal(listed?.status, "closed");
  assert.equal(listed?.checkpoints.length, 1);
  assert.deepEqual(listed?.touchedFiles, ["packages/storage/src/sessions.ts"]);
});

test("session filenames do not overwrite same-title sessions", async (t) => {
  const { project } = await createTempProject(t, "Storage Filename Collisions");

  const first = await startSession({
    project,
    repoPath: project.memoryRoot,
    workingDirectory: project.memoryRoot,
    taskTitle: "Repeated Task"
  });
  const second = await startSession({
    project,
    repoPath: project.memoryRoot,
    workingDirectory: project.memoryRoot,
    taskTitle: "Repeated Task"
  });

  assert.notEqual(first.id, second.id);
  assert.notEqual(first.filePath, second.filePath);
  assert.ok(second.filePath);
  assert.match(path.basename(second.filePath), /-2\.md$/);
});

test("documents round-trip Markdown body and metadata", async (t) => {
  const { project } = await createTempProject(t, "Storage Documents");
  const body = [
    "# Billing Overview",
    "",
    "The body can contain frontmatter-like separators.",
    "",
    "---",
    "",
    "Do not treat this as file frontmatter."
  ].join("\n");

  const doc = await createDocument({
    project,
    title: "Billing Overview",
    type: "architecture-note",
    body,
    visibility: "ai-pinned",
    topics: ["billing", "runtime"],
    relatedFiles: ["services/billing.ts"]
  });

  const listed = (await listProjectDocuments(project)).find((item) => item.id === doc.id);
  assert.ok(listed);
  assert.equal(listed.title, "Billing Overview");
  assert.equal(listed.body, body);
  assert.equal(listed.visibility, "ai-pinned");
  assert.deepEqual(listed.topics, ["billing", "runtime"]);
  assert.deepEqual(listed.relatedFiles, ["services/billing.ts"]);
});

async function createTempProject(t: TestContext, name: string) {
  const memoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-storage-test-"));
  t.after(() => fs.rm(memoryRoot, { recursive: true, force: true }));

  const registry = new ProjectRegistry(memoryRoot);
  const preview = await prepareProjectCreation({
    registry,
    projectName: name,
    createPointerFile: false
  });
  const project = await createProjectFromPreview({ registry, preview });
  return { memoryRoot, registry, project };
}
