import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInteropPath } from "./fs.js";

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
