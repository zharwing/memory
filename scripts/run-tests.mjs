import { spawnSync } from "node:child_process";
import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";

const roots = ["apps", "packages"];
const ignoredDirectories = new Set(["node_modules", ".git"]);
const tests = [];

for (const root of roots) {
  collectWorkspaceDistTests(path.resolve(root));
}

if (tests.length === 0) {
  console.log("No compiled test files found.");
  process.exit(0);
}

const result = spawnSync(process.execPath, ["--preserve-symlinks", "--test", ...tests], {
  stdio: "inherit"
});

process.exit(result.status ?? 1);

function collectWorkspaceDistTests(root) {
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry);
    const stats = lstatSync(fullPath);
    if (stats.isSymbolicLink() || !stats.isDirectory()) continue;
    collectTests(path.join(fullPath, "dist"));
  }
}

function collectTests(current) {
  let entries;
  try {
    entries = readdirSync(current);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(current, entry);
    const stats = lstatSync(fullPath);
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) {
      if (ignoredDirectories.has(entry)) continue;
      collectTests(fullPath);
      continue;
    }

    if (/\.test\.js$/i.test(entry) && fullPath.includes(`${path.sep}dist${path.sep}`)) {
      tests.push(fullPath);
    }
  }
}
