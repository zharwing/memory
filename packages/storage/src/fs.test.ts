import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { atomicWriteText, normalizeInteropPath, readBoundedJson } from "./fs.js";

test("normalizeInteropPath maps WSL mount paths for a Windows daemon", () => {
  assert.equal(
    normalizeInteropPath("/mnt/d/ai/llm-memory/project", "win32", false),
    "D:/ai/llm-memory/project"
  );
  assert.equal(normalizeInteropPath("/mnt/c", "win32", false), "C:/");
});

test("normalizeInteropPath maps Windows drive paths for a WSL daemon", () => {
  assert.equal(
    normalizeInteropPath("D:\\ai\\llm-memory\\project", "linux", true),
    "/mnt/d/ai/llm-memory/project"
  );
  assert.equal(
    normalizeInteropPath("D:/ai/llm-memory/project", "linux", true),
    "/mnt/d/ai/llm-memory/project"
  );
});

test("normalizeInteropPath leaves native paths unchanged", () => {
  assert.equal(normalizeInteropPath("/srv/project", "linux", false), "/srv/project");
  assert.equal(normalizeInteropPath("D:\\project", "win32", false), "D:\\project");
});

test("safe storage accepts an ordinary Windows path through an extended-length alias", async (t) => {
  const ordinaryRoot = await tempRoot(t);
  const root = process.platform === "win32" ? path.toNamespacedPath(ordinaryRoot) : ordinaryRoot;
  const target = path.join(root, "records", "record.json");
  await atomicWriteText(target, '{"ok":true}\n', { root });
  assert.deepEqual(await readBoundedJson(target, { root, maximumBytes: 1_024 }), { ok: true });
});

test("safe storage rejects a junction or symlink inside its owner root", async (t) => {
  const root = await tempRoot(t);
  const owner = path.join(root, "owner");
  const outside = path.join(root, "outside");
  const linked = path.join(owner, "linked");
  await fs.mkdir(owner);
  await fs.mkdir(outside);
  try {
    await fs.symlink(outside, linked, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return;
    throw error;
  }
  await assert.rejects(
    atomicWriteText(path.join(linked, "record.json"), "{}\n", { root: owner }),
    /traverses a filesystem link/
  );
});

async function tempRoot(t: TestContext): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-storage-paths-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
