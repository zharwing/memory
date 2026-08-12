import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import {
  DEFAULT_ASSISTANT_POLICY,
  DEFAULT_CONTEXT_POLICY,
  DEFAULT_PRIVACY_POLICY,
  type Project,
  type Session,
  type SessionSummary
} from "@zharwing/memory-core";
import { SessionAuthorityStore } from "./session-visibility.js";

test("session authority is owner, namespace, generation, and HMAC bound", async (t) => {
  const root = await tempRoot(t);
  const stateRoot = path.join(root, "authority");
  const key = Buffer.alloc(32, 3);
  const first = store(stateRoot, key, "a");
  const project = fixtureProject(path.join(root, "memory"), "2026-08-12T10:00:00.000Z");
  const session = fixtureSession(project);
  const summary = fixtureSummary(session);
  await first.recordAgentOwnedRevision(
    project,
    session,
    summary,
    "owner-a",
    "agent-start-session",
    async () => session
  );
  assert.equal(await first.isAgentOwnedRevision(project, session, "owner-a"), true);
  assert.equal(await first.isAgentOwnedRevision(project, session, "owner-b"), false);
  assert.equal(
    await store(stateRoot, key, "b").isAgentOwnedRevision(project, session, "owner-a"),
    false
  );
  assert.equal(await first.isAgentOwnedRevision(
    fixtureProject(project.memoryRoot, "2026-08-12T11:00:00.000Z"),
    session,
    "owner-a"
  ), false);
  assert.equal(
    await first.isAgentOwnedRevision(
      project,
      { ...session, body: `${session.body}\nHUMAN_PRIVATE_CANARY` },
      "owner-a"
    ),
    false,
    "a later body revision cannot inherit session authority"
  );

  await fs.appendFile(path.join(stateRoot, "session-authority.jsonl"), `${JSON.stringify({
    schema: "zharwing.session-authority.v3",
    namespace: "a".repeat(64),
    projectGeneration: "0".repeat(64),
    projectId: project.id,
    sessionId: "session-forged",
    owner: "owner-a",
    provenance: "agent-start-session",
    sessionRevision: "0".repeat(64),
    summaryRevision: "0".repeat(64),
    visibility: "ai-eligible",
    recordedAt: "2026-08-12T10:00:00.000Z",
    mac: "0".repeat(64)
  })}\n`, "utf8");
  assert.equal(
    await first.isAgentOwnedRevision(project, session, "owner-a"),
    false,
    "one forged line invalidates the read"
  );
});

test("session authority rejects a linked state root", async (t) => {
  const root = await tempRoot(t);
  const actual = path.join(root, "actual");
  const linked = path.join(root, "linked");
  await fs.mkdir(actual);
  try {
    await fs.symlink(actual, linked, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return;
    throw error;
  }
  const authority = store(linked, Buffer.alloc(32, 4), "c");
  const project = fixtureProject(path.join(root, "memory"), "2026-08-12T10:00:00.000Z");
  const session = fixtureSession(project);
  await assert.rejects(
    authority.recordAgentOwnedRevision(
      project,
      session,
      fixtureSummary(session),
      "owner-a",
      "agent-start-session",
      async () => session
    ),
    /unsafe|traverses a link/
  );
});

function store(stateRoot: string, key: Buffer, namespaceSeed: string): SessionAuthorityStore {
  return new SessionAuthorityStore({
    stateRoot,
    key,
    namespace: namespaceSeed.repeat(64),
    now: () => new Date("2026-08-12T10:00:00.000Z")
  });
}

function fixtureProject(memoryRoot: string, created: string): Project {
  return {
    id: "project-a",
    name: "Project A",
    slug: "project-a",
    memoryRoot,
    repos: [],
    created,
    updated: created,
    privacyPolicy: DEFAULT_PRIVACY_POLICY,
    contextPolicy: DEFAULT_CONTEXT_POLICY,
    assistantPolicy: DEFAULT_ASSISTANT_POLICY
  };
}

function fixtureSession(project: Project): Session {
  const created = "2026-08-12T10:00:00.000Z";
  return {
    id: "session-a",
    projectId: project.id,
    repoPath: "/synthetic/repo",
    workingDirectory: "/synthetic/repo",
    status: "active",
    started: created,
    updated: created,
    taskTitle: "Agent session",
    includeInGraph: false,
    topics: [],
    nextSteps: [],
    blockers: [],
    touchedFiles: [],
    workstreamIds: [],
    relatedDocs: [],
    relatedTasks: [],
    checkpoints: [],
    body: "# Agent session\n",
    stateSemanticsVersion: 2
  };
}

function fixtureSummary(session: Session): SessionSummary {
  return {
    id: session.id,
    projectId: session.projectId,
    status: session.status,
    taskTitle: session.taskTitle,
    started: session.started,
    updated: session.updated,
    topics: [],
    nextSteps: [],
    blockers: [],
    touchedFiles: [],
    checkpointCount: 0,
    totalTouchedFiles: 0,
    workstreamIds: [],
    includeInGraph: false,
    revision: session.updated
  };
}

async function tempRoot(t: TestContext): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-session-authority-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
