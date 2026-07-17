import { lstatSync, readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

export const WORKSPACE_ROOTS = ["apps", "packages"];

export function toPosix(value) {
  return value.split(path.sep).join("/");
}

export function listWorkspaces(repoRoot) {
  const workspaces = [];
  for (const rootName of WORKSPACE_ROOTS) {
    const rootDir = path.join(repoRoot, rootName);
    let entries;
    try {
      entries = readdirSync(rootDir);
    } catch {
      continue;
    }
    for (const entry of entries.sort()) {
      const workspaceDir = path.join(rootDir, entry);
      let stats;
      try {
        stats = lstatSync(workspaceDir);
      } catch {
        continue;
      }
      if (stats.isSymbolicLink() || !stats.isDirectory()) continue;
      if (!existsSync(path.join(workspaceDir, "package.json"))) continue;
      workspaces.push({
        name: `${rootName}/${entry}`,
        dir: workspaceDir
      });
    }
  }
  return workspaces;
}

export function walkFiles(dir, visit) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries.sort()) {
    const fullPath = path.join(dir, entry);
    let stats;
    try {
      stats = lstatSync(fullPath);
    } catch {
      continue;
    }
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) {
      walkFiles(fullPath, visit);
      continue;
    }
    if (stats.isFile()) visit(fullPath);
  }
}

export function readWorkspaceTsconfig(workspaceDir) {
  const tsconfigPath = path.join(workspaceDir, "tsconfig.json");
  let raw;
  try {
    raw = readFileSync(tsconfigPath, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse ${toPosix(tsconfigPath)}: ${error.message}`);
  }
  const compilerOptions = parsed.compilerOptions ?? {};
  return {
    noEmit: compilerOptions.noEmit === true,
    rootDir: compilerOptions.rootDir ?? "src",
    outDir: compilerOptions.outDir ?? "dist"
  };
}
