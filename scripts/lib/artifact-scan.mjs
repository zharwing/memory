import path from "node:path";

import { listWorkspaces, toPosix, walkFiles } from "./workspace-files.mjs";

const FORBIDDEN_SUFFIXES = [
  ".js",
  ".js.map",
  ".mjs",
  ".mjs.map",
  ".cjs",
  ".cjs.map",
  ".d.ts",
  ".d.ts.map",
  ".d.mts",
  ".d.mts.map",
  ".d.cts",
  ".d.cts.map"
];

// Exact repository-relative paths (posix-normalized) of reviewed handwritten
// exceptions. Every entry must carry an adjacent rationale and owner comment.
const ALLOWLIST = new Set([]);

export function isForbiddenArtifact(fileName) {
  return FORBIDDEN_SUFFIXES.some((suffix) => fileName.toLowerCase().endsWith(suffix));
}

export function scanSourceArtifacts(repoRoot) {
  const offenders = [];
  for (const workspace of listWorkspaces(repoRoot)) {
    const srcDir = path.join(workspace.dir, "src");
    walkFiles(srcDir, (file) => {
      if (!isForbiddenArtifact(path.basename(file))) return;
      const relative = toPosix(path.relative(repoRoot, file));
      if (ALLOWLIST.has(relative)) return;
      offenders.push(relative);
    });
  }
  return offenders.sort();
}
