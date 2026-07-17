import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { discoverRunnerSelfTests, discoverWorkspaceTests } from "./lib/test-discovery.mjs";

const args = process.argv.slice(2);
const coverage = args.includes("--coverage");
const rootFlagIndex = args.indexOf("--root");
const repoRoot =
  rootFlagIndex !== -1 && args[rootFlagIndex + 1]
    ? path.resolve(args[rootFlagIndex + 1])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const includeSelfTests = rootFlagIndex === -1;

let discovery;
try {
  discovery = discoverWorkspaceTests(repoRoot);
} catch (error) {
  console.error(`Test discovery failed: ${error.message}`);
  process.exit(1);
}

if (discovery.noEmitViolations.length > 0) {
  console.error("Tests exist in workspaces that do not emit compiled output:");
  for (const violation of discovery.noEmitViolations) {
    console.error(`  ${violation.file} (${violation.workspace})`);
  }
  console.error("Add an explicit browser/TSX test runner for these workspaces; they cannot run through the compiled Node runner.");
  process.exit(1);
}

if (discovery.sourceTests.length === 0) {
  console.error("No source test files (src/**/*.test.ts) were discovered. Zero tests is a failure, not a success.");
  process.exit(1);
}

if (discovery.missingCompiled.length > 0) {
  console.error("Expected compiled test files are missing. Run the TypeScript build (pnpm test compiles automatically):");
  for (const missing of discovery.missingCompiled) {
    console.error(`  ${missing}`);
  }
  process.exit(1);
}

if (discovery.staleCompiled.length > 0) {
  console.error("Stale compiled test files have no source counterpart. Clean the build output (tsc -b --clean):");
  for (const stale of discovery.staleCompiled) {
    console.error(`  ${stale}`);
  }
  process.exit(1);
}

const selfTests = includeSelfTests ? discoverRunnerSelfTests(repoRoot) : [];
const filesToRun = [...discovery.expectedCompiled, ...selfTests];

console.log(
  `Discovered ${discovery.sourceTests.length} source test files; running ${discovery.expectedCompiled.length} compiled test files` +
    (selfTests.length > 0 ? ` plus ${selfTests.length} runner self-test files.` : ".")
);

const nodeArgs = ["--preserve-symlinks"];
if (coverage) {
  nodeArgs.push(
    "--experimental-test-coverage",
    "--test-coverage-exclude=**/*.test.js",
    "--test-coverage-exclude=**/*.test.mjs",
    "--test-coverage-exclude=**/node_modules/**",
    "--test-coverage-exclude=scripts/**",
    "--test-coverage-lines=50",
    "--test-coverage-branches=55",
    "--test-coverage-functions=40"
  );
}
nodeArgs.push("--test", ...filesToRun);

// Drop any inherited test-runner context so a nested invocation (e.g. from the
// runner's own fixture tests) still reports real child exit codes.
const childEnv = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT;

const result = spawnSync(process.execPath, nodeArgs, { stdio: "inherit", cwd: repoRoot, env: childEnv });

if (result.error) {
  console.error(`Failed to spawn test process: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  console.error(`Test process terminated by signal ${result.signal}.`);
  process.exit(1);
}
process.exit(result.status ?? 1);
