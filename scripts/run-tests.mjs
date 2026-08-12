import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
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
const requireFromRepo = createRequire(path.join(repoRoot, "package.json"));

let discovery;
try {
  discovery = discoverWorkspaceTests(repoRoot);
} catch (error) {
  console.error(`Test discovery failed: ${error.message}`);
  process.exit(1);
}

if (discovery.noEmitViolations.length > 0) {
  console.error("Tests exist in workspaces that do not emit compiled output and have no registered source lane:");
  for (const violation of discovery.noEmitViolations) {
    console.error(`  ${violation.file} (${violation.workspace})`);
  }
  console.error("Register an explicit existing-tool source runner for these workspaces; refusing to silently send them through the compiled Node runner.");
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
const compiledFilesToRun = [...discovery.expectedCompiled, ...selfTests];

if (discovery.frontendSourceTests.length > 0) {
  try {
    requireFromRepo.resolve("tsx");
  } catch {
    console.error(
      "Desktop TypeScript/TSX tests were discovered, but the repository-declared tsx source runner is unavailable. " +
        "Refusing to send these files to the compiled Node lane."
    );
    process.exit(1);
  }
}

console.log(
  `Discovered ${discovery.sourceTests.length} source test files; running ${discovery.expectedCompiled.length} compiled test files` +
    (discovery.frontendSourceTests.length > 0
      ? ` and ${discovery.frontendSourceTests.length} desktop source test files through tsx`
      : "") +
    (selfTests.length > 0 ? ` plus ${selfTests.length} runner self-test files.` : ".")
);

function coverageArgs() {
  if (!coverage) return [];
  return [
    "--experimental-test-coverage",
    "--test-coverage-exclude=**/*.test.js",
    "--test-coverage-exclude=**/*.test.mjs",
    "--test-coverage-exclude=**/*.test.ts",
    "--test-coverage-exclude=**/*.test.tsx",
    "--test-coverage-exclude=**/node_modules/**",
    "--test-coverage-exclude=scripts/**",
    "--test-coverage-lines=50",
    "--test-coverage-branches=55",
    "--test-coverage-functions=40"
  ];
}

const nodeArgs = ["--preserve-symlinks", ...coverageArgs()];
if (coverage) {
  console.log("Coverage thresholds are enforced independently for compiled and desktop source lanes.");
}
nodeArgs.push("--test", ...compiledFilesToRun);

// Drop any inherited test-runner context so a nested invocation (e.g. from the
// runner's own fixture tests) still reports real child exit codes.
const childEnv = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT;

function runNodeTests(label, argsToRun, env = childEnv) {
  if (argsToRun.at(-1) === "--test") return 0;
  const result = spawnSync(process.execPath, argsToRun, { stdio: "inherit", cwd: repoRoot, env });

  if (result.error) {
    console.error(`Failed to spawn ${label} test process: ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    console.error(`${label} test process terminated by signal ${result.signal}.`);
    return 1;
  }
  return result.status ?? 1;
}

const compiledStatus = runNodeTests("compiled", nodeArgs);
const frontendArgs = [
  "--import",
  "tsx",
  ...coverageArgs(),
  "--test",
  ...discovery.frontendSourceTests
];
const frontendStatus = discovery.frontendSourceTests.length > 0
  ? runNodeTests("desktop source", frontendArgs, {
      ...childEnv,
      TSX_TSCONFIG_PATH: path.join(repoRoot, "apps", "desktop", "tsconfig.json")
    })
  : 0;

process.exit(compiledStatus === 0 && frontendStatus === 0 ? 0 : 1);
