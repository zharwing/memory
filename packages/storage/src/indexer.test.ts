import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import {
  PROJECT_INDEX_SCHEMA,
  ProjectRegistry,
  createDocument,
  createProjectFromPreview,
  prepareProjectCreation,
  rebuildProjectIndex,
  startSession
} from "./index.js";

test("rebuildProjectIndex writes a versioned, self-describing project manifest", async (t) => {
  const memoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-index-test-"));
  t.after(() => fs.rm(memoryRoot, { recursive: true, force: true }));
  const registry = new ProjectRegistry(memoryRoot);
  const preview = await prepareProjectCreation({
    registry,
    projectName: "Index Contract",
    createPointerFile: false
  });
  const project = await createProjectFromPreview({ registry, preview });

  await startSession({
    project,
    repoPath: project.memoryRoot,
    workingDirectory: project.memoryRoot,
    taskTitle: "Index one session"
  });
  await createDocument({
    project,
    title: "Indexed document",
    type: "overview",
    body: "Searchable project knowledge."
  });

  const result = await rebuildProjectIndex(project);
  const index = JSON.parse(await fs.readFile(result.indexPath, "utf8"));

  assert.equal(index.schema, PROJECT_INDEX_SCHEMA);
  assert.equal(index.projectId, project.id);
  assert.match(index.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(index.counts, result.counts);
  assert.equal(index.sessions.length, result.counts.sessions);
  assert.equal(index.documents.length, result.counts.documents);
});
