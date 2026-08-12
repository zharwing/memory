import crypto from "node:crypto";
import fs from "node:fs";
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

export function inventoryArtifacts(root, options = {}) {
  const absoluteRoot = path.resolve(root);
  if (!fs.existsSync(absoluteRoot)) throw new Error(`Artifact root does not exist: ${absoluteRoot}`);
  const files = [];
  walkArtifactDirectory(absoluteRoot, absoluteRoot, files, options);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function scanArtifactText(inventory, rules) {
  const findings = [];
  for (const file of inventory) {
    if (file.bytes > (rules.maximumScannedFileBytes ?? 16 * 1024 * 1024)) {
      findings.push({ path: file.path, rule: "oversized-unscanned-file" });
      continue;
    }
    const bytes = fs.readFileSync(file.absolutePath);
    if (bytes.includes(0)) continue;
    const text = bytes.toString("utf8");
    for (const rule of rules.patterns ?? []) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(text)) findings.push({ path: file.path, rule: rule.id });
    }
  }
  return findings;
}

export function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/**
 * Stable digest for one already-inventoried artifact tree. Paths, byte counts,
 * and per-file hashes are all bound so neither renaming nor truncation can
 * preserve the candidate identity.
 */
export function artifactInventoryDigest(inventory) {
  const canonical = [...inventory]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`)
    .join("");
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

function walkArtifactDirectory(root, directory, files, options) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = toPosix(path.relative(root, absolutePath));
    if ((options.excludedPaths ?? []).some((pattern) => pattern.test(relativePath))) continue;
    const metadata = fs.lstatSync(absolutePath);
    if (metadata.isSymbolicLink()) {
      throw new Error(`Artifact tree contains a symbolic link: ${relativePath}`);
    }
    if (metadata.isDirectory()) {
      walkArtifactDirectory(root, absolutePath, files, options);
      continue;
    }
    if (!metadata.isFile()) throw new Error(`Artifact tree contains a non-file entry: ${relativePath}`);
    files.push({
      path: relativePath,
      absolutePath,
      bytes: metadata.size,
      sha256: sha256File(absolutePath)
    });
  }
}
