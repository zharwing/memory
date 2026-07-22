import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { discoverWorkspaceTests, mapSourceToCompiled } from "./test-discovery.mjs";

const RUNNER_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "run-tests.mjs");

function makeFixtureRepo() {
  const root = mkdtempSync(path.join(os.tmpdir(), "zharwing-runner-fixture-"));
  mkdirSync(path.join(root, "apps"), { recursive: true });
  mkdirSync(path.join(root, "packages"), { recursive: true });
  return root;
}

function addWorkspace(root, name, { noEmit = false } = {}) {
  const dir = path.join(root, name);
  mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: `@fixture/${path.basename(name)}` }));
  const compilerOptions = noEmit
    ? { outDir: "dist", composite: true, noEmit: true }
    : { outDir: "dist", rootDir: "src", composite: true };
  writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions, include: ["src"] }));
  return dir;
}

function runRunner(root) {
  return spawnSync(process.execPath, [RUNNER_PATH, "--root", root], { encoding: "utf8" });
}

test("discovery fails the runner when no source tests exist", () => {
  const root = makeFixtureRepo();
  try {
    addWorkspace(root, "packages/empty");
    const result = runRunner(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No source test files/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discovery reports a missing compiled counterpart", () => {
  const root = makeFixtureRepo();
  try {
    const dir = addWorkspace(root, "packages/lib");
    writeFileSync(path.join(dir, "src", "thing.test.ts"), "");
    const result = runRunner(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing/i);
    assert.match(result.stderr, /packages\/lib\/dist\/thing\.test\.js/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discovery reports stale compiled output without a source counterpart", () => {
  const root = makeFixtureRepo();
  try {
    const dir = addWorkspace(root, "packages/lib");
    mkdirSync(path.join(dir, "src", "nested"), { recursive: true });
    writeFileSync(path.join(dir, "src", "nested", "keep.test.ts"), "");
    mkdirSync(path.join(dir, "dist", "nested"), { recursive: true });
    writeFileSync(path.join(dir, "dist", "nested", "keep.test.js"), "import { test } from 'node:test'; test('x', () => {});");
    writeFileSync(path.join(dir, "dist", "removed.test.js"), "");
    const result = runRunner(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /[Ss]tale/);
    assert.match(result.stderr, /packages\/lib\/dist\/removed\.test\.js/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discovery fails when a noEmit workspace contains tests", () => {
  const root = makeFixtureRepo();
  try {
    const dir = addWorkspace(root, "apps/ui", { noEmit: true });
    writeFileSync(path.join(dir, "src", "view.test.tsx"), "");
    const result = runRunner(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /do not emit compiled output/);
    assert.match(result.stderr, /apps\/ui\/src\/view\.test\.tsx/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runner executes discovered compiled tests and propagates child failure", () => {
  const root = makeFixtureRepo();
  try {
    const dir = addWorkspace(root, "packages/lib");
    writeFileSync(path.join(dir, "src", "fail.test.ts"), "");
    mkdirSync(path.join(dir, "dist"), { recursive: true });
    writeFileSync(
      path.join(dir, "dist", "fail.test.js"),
      "import { test } from 'node:test'; import assert from 'node:assert'; test('fails', () => { assert.equal(1, 2); });"
    );
    const result = runRunner(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Discovered 1 source test files; running 1 compiled test files\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runner succeeds when compiled tests pass", () => {
  const root = makeFixtureRepo();
  try {
    const dir = addWorkspace(root, "packages/lib");
    writeFileSync(path.join(dir, "src", "ok.test.ts"), "");
    mkdirSync(path.join(dir, "dist"), { recursive: true });
    writeFileSync(
      path.join(dir, "dist", "ok.test.js"),
      "import { test } from 'node:test'; import assert from 'node:assert'; test('ok', () => { assert.equal(1, 1); });"
    );
    const result = runRunner(root);
    assert.equal(result.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("source-to-compiled mapping honors rootDir and outDir with posix and windows style separators", () => {
  const workspaceDir = path.join("packages", "lib");
  const tsconfig = { rootDir: "src", outDir: "dist", noEmit: false };
  const source = path.join(workspaceDir, "src", "nested", "a.test.ts");
  const compiled = mapSourceToCompiled(workspaceDir, tsconfig, source);
  assert.equal(compiled, path.resolve(workspaceDir, "dist", "nested", "a.test.js"));
});

test("discovery skips symlinked directories", { skip: process.platform === "win32" }, async () => {
  const { symlinkSync } = await import("node:fs");
  const root = makeFixtureRepo();
  try {
    const dir = addWorkspace(root, "packages/lib");
    writeFileSync(path.join(dir, "src", "real.test.ts"), "");
    const outside = mkdtempSync(path.join(os.tmpdir(), "zharwing-runner-outside-"));
    writeFileSync(path.join(outside, "linked.test.ts"), "");
    symlinkSync(outside, path.join(dir, "src", "linked"), "dir");
    try {
      const discovery = discoverWorkspaceTests(root);
      assert.deepEqual(discovery.sourceTests, ["packages/lib/src/real.test.ts"]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
