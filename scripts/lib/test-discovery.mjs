import { existsSync } from "node:fs";
import path from "node:path";

import { listWorkspaces, readWorkspaceTsconfig, toPosix, walkFiles } from "./workspace-files.mjs";

const SOURCE_TEST_PATTERN = /\.test\.tsx?$/i;
const COMPILED_TEST_PATTERN = /\.test\.js$/i;

export function mapSourceToCompiled(workspaceDir, tsconfig, sourceFile) {
  const rootDir = path.resolve(workspaceDir, tsconfig.rootDir);
  const outDir = path.resolve(workspaceDir, tsconfig.outDir);
  const relative = path.relative(rootDir, sourceFile);
  return path.join(outDir, relative.replace(SOURCE_TEST_PATTERN, ".test.js"));
}

export function mapCompiledToSourceCandidates(workspaceDir, tsconfig, compiledFile) {
  const rootDir = path.resolve(workspaceDir, tsconfig.rootDir);
  const outDir = path.resolve(workspaceDir, tsconfig.outDir);
  const relative = path.relative(outDir, compiledFile);
  const base = relative.replace(COMPILED_TEST_PATTERN, "");
  return [path.join(rootDir, `${base}.test.ts`), path.join(rootDir, `${base}.test.tsx`)];
}

export function discoverWorkspaceTests(repoRoot) {
  const result = {
    sourceTests: [],
    expectedCompiled: [],
    missingCompiled: [],
    staleCompiled: [],
    noEmitViolations: []
  };

  for (const workspace of listWorkspaces(repoRoot)) {
    const tsconfig = readWorkspaceTsconfig(workspace.dir);
    const srcDir = path.join(workspace.dir, "src");
    const sourceTests = [];
    walkFiles(srcDir, (file) => {
      if (SOURCE_TEST_PATTERN.test(file)) sourceTests.push(file);
    });
    sourceTests.sort();

    if (sourceTests.length > 0 && (!tsconfig || tsconfig.noEmit)) {
      result.noEmitViolations.push(
        ...sourceTests.map((file) => ({ workspace: workspace.name, file: toPosix(path.relative(repoRoot, file)) }))
      );
      continue;
    }

    for (const sourceFile of sourceTests) {
      const compiled = mapSourceToCompiled(workspace.dir, tsconfig, sourceFile);
      result.sourceTests.push(toPosix(path.relative(repoRoot, sourceFile)));
      if (existsSync(compiled)) {
        result.expectedCompiled.push(compiled);
      } else {
        result.missingCompiled.push(toPosix(path.relative(repoRoot, compiled)));
      }
    }

    if (!tsconfig || tsconfig.noEmit) continue;
    const outDir = path.resolve(workspace.dir, tsconfig.outDir);
    walkFiles(outDir, (file) => {
      if (!COMPILED_TEST_PATTERN.test(file)) return;
      const candidates = mapCompiledToSourceCandidates(workspace.dir, tsconfig, file);
      if (!candidates.some((candidate) => existsSync(candidate))) {
        result.staleCompiled.push(toPosix(path.relative(repoRoot, file)));
      }
    });
  }

  result.expectedCompiled.sort();
  result.sourceTests.sort();
  result.missingCompiled.sort();
  result.staleCompiled.sort();
  return result;
}

export function discoverRunnerSelfTests(repoRoot) {
  const scriptsDir = path.join(repoRoot, "scripts");
  const selfTests = [];
  walkFiles(scriptsDir, (file) => {
    if (/\.test\.mjs$/i.test(file)) selfTests.push(file);
  });
  return selfTests.sort();
}
