import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  artifactInventoryDigest,
  inventoryArtifacts,
  isForbiddenArtifact,
  scanSourceArtifacts
} from "./artifact-scan.mjs";

const GUARD_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "check-source-artifacts.mjs");

function makeFixtureRepo() {
  const root = mkdtempSync(path.join(os.tmpdir(), "zharwing-guard-fixture-"));
  const src = path.join(root, "packages", "lib", "src");
  mkdirSync(src, { recursive: true });
  writeFileSync(path.join(root, "packages", "lib", "package.json"), JSON.stringify({ name: "@fixture/lib" }));
  return { root, src };
}

test("every forbidden suffix is rejected", () => {
  const forbidden = [
    "a.js",
    "a.js.map",
    "a.mjs",
    "a.mjs.map",
    "a.cjs",
    "a.cjs.map",
    "a.d.ts",
    "a.d.ts.map",
    "a.d.mts",
    "a.d.mts.map",
    "a.d.cts",
    "a.d.cts.map"
  ];
  for (const name of forbidden) {
    assert.equal(isForbiddenArtifact(name), true, `${name} should be forbidden`);
  }
});

test("authored source and asset files are allowed", () => {
  const allowed = ["a.ts", "a.tsx", "a.css", "a.json", "a.md", "a.svg", "a.png"];
  for (const name of allowed) {
    assert.equal(isForbiddenArtifact(name), false, `${name} should be allowed`);
  }
});

test("scan reports nested artifacts with sorted posix paths", () => {
  const { root, src } = makeFixtureRepo();
  try {
    mkdirSync(path.join(src, "deep", "deeper"), { recursive: true });
    writeFileSync(path.join(src, "deep", "deeper", "z.js"), "");
    writeFileSync(path.join(src, "a.d.ts"), "");
    writeFileSync(path.join(src, "ok.ts"), "");
    const offenders = scanSourceArtifacts(root);
    assert.deepEqual(offenders, ["packages/lib/src/a.d.ts", "packages/lib/src/deep/deeper/z.js"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("guard CLI exits non-zero with remediation text when artifacts exist", () => {
  const { root, src } = makeFixtureRepo();
  try {
    writeFileSync(path.join(src, "__artifact_probe.js"), "");
    const result = spawnSync(process.execPath, [GUARD_PATH, "--root", root], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /__artifact_probe\.js/);
    assert.match(result.stderr, /authored source only/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("guard CLI exits zero on a clean tree", () => {
  const { root, src } = makeFixtureRepo();
  try {
    writeFileSync(path.join(src, "index.ts"), "export {};");
    const result = spawnSync(process.execPath, [GUARD_PATH, "--root", root], { encoding: "utf8" });
    assert.equal(result.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("artifact identity binds paths, sizes, and bytes deterministically", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "zharwing-artifact-identity-"));
  try {
    writeFileSync(path.join(root, "a.js"), "one");
    writeFileSync(path.join(root, "b.css"), "two");
    const first = artifactInventoryDigest(inventoryArtifacts(root));
    const second = artifactInventoryDigest(inventoryArtifacts(root));
    assert.equal(first, second);
    writeFileSync(path.join(root, "a.js"), "changed");
    assert.notEqual(artifactInventoryDigest(inventoryArtifacts(root)), first);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scan skips symlinked directories", { skip: process.platform === "win32" }, async () => {
  const { symlinkSync } = await import("node:fs");
  const { root, src } = makeFixtureRepo();
  try {
    const outside = mkdtempSync(path.join(os.tmpdir(), "zharwing-guard-outside-"));
    writeFileSync(path.join(outside, "linked.js"), "");
    symlinkSync(outside, path.join(src, "linked"), "dir");
    try {
      assert.deepEqual(scanSourceArtifacts(root), []);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
