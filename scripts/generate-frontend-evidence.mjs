import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  artifactInventoryDigest,
  inventoryArtifacts,
  sha256File
} from "./lib/artifact-scan.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const argumentsList = process.argv.slice(2);
validateArguments(argumentsList);
const profile = option("--profile") ?? "hardened-local";
if (!new Set(["personal-preview", "hardened-local"]).has(profile)) {
  throw new Error("Frontend evidence profile must be personal-preview or hardened-local.");
}
const initialSource = sourceIdentity();
const initialPnpmLockSha256 = sha256File(path.join(repoRoot, "pnpm-lock.yaml"));
const initialCargoLockSha256 = existsSync(path.join(repoRoot, "apps", "desktop", "src-tauri", "Cargo.lock"))
  ? sha256File(path.join(repoRoot, "apps", "desktop", "src-tauri", "Cargo.lock"))
  : null;

const commands = [
  command("typed-workspace", ["node_modules/typescript/bin/tsc", "-b", "--force", "--pretty", "false"]),
  command("web-build", ["node_modules/vite/bin/vite.js", "build", "--config", "apps/desktop/vite.config.ts"]),
  command("bundle-budget", ["scripts/check-bundle-size.mjs"]),
  command("source-artifacts", ["scripts/check-source-artifacts.mjs"]),
  command("secretless-build", ["scripts/check-secretless-build.mjs"])
];
const commandEvidence = commands.map(runRequiredCommand);

const deferredPlatformValidation = [];
const optionalEvidence = [];
if (argumentsList.includes("--browser-smoke")) {
  optionalEvidence.push(runOptionalCommand(
    command("browser-smoke", ["scripts/desktop-browser-smoke.mjs"]),
    "supported-browser-unavailable"
  ));
} else {
  deferredPlatformValidation.push(deferred("browser-smoke", "not-requested-for-this-candidate"));
}

const tauriSidecar = option("--tauri-sidecar");
if (tauriSidecar) {
  optionalEvidence.push(runOptionalCommand(
    command("tauri-package", ["scripts/tauri-build.mjs"]),
    "pinned-windows-rust-tauri-environment-unavailable",
    { ZHARWING_MEMORY_DAEMON_SIDECAR: boundedRepositoryFile(tauriSidecar) }
  ));
} else {
  deferredPlatformValidation.push(deferred("tauri-package", "approved-sidecar-or-pinned-platform-not-requested"));
}

for (const result of optionalEvidence) {
  if (result.status === "deferred_platform_validation") {
    deferredPlatformValidation.push(deferred(result.id, result.reason));
  }
}
deferredPlatformValidation.push(
  deferred("code-signing", "distribution-signing-policy-not-enabled"),
  deferred("physical-webview-device-matrix", "separate-device-qualification"),
  deferred("screen-reader-matrix", "separate-assistive-technology-qualification"),
  deferred("external-dependency-audit", "networked-audit-tool-not-in-local-source-only-closure")
);

const performance = readPerformanceEvidence(option("--performance"));
if (performance.status === "deferred_platform_validation") {
  deferredPlatformValidation.push(deferred("controlled-performance-scenarios", performance.reason));
}

// Optional packaging may rebuild the web payload as part of the Tauri hook.
// Generate supply-chain outputs only after every requested artifact-producing
// command so the manifest can never bind pre-package bytes.
const sbomEvidence = runRequiredCommand(command(
  "sbom-and-checksums",
  ["scripts/generate-sbom.mjs", ...repeatedOptions("--artifact")]
));
commandEvidence.push(sbomEvidence);
const sbomResult = parseJsonResult(sbomEvidence.stdout, "SBOM/checksum generator");
for (const field of ["artifactDigest", "releaseSetDigest", "dependencyClosureDigest", "sbomSha256", "checksumsSha256"]) {
  if (!/^[a-f0-9]{64}$/.test(sbomResult[field] ?? "")) {
    throw new Error(`SBOM/checksum generator returned an invalid ${field}.`);
  }
}

const distDir = path.join(repoRoot, "apps", "desktop", "dist");
const inventory = inventoryArtifacts(distDir);
const artifactDigest = artifactInventoryDigest(inventory);
if (sbomResult.artifactDigest !== artifactDigest) {
  throw new Error("SBOM/checksum output is not bound to the final frontend artifact.");
}

const pnpmLock = path.join(repoRoot, "pnpm-lock.yaml");
const cargoLock = path.join(repoRoot, "apps", "desktop", "src-tauri", "Cargo.lock");
const finalSource = sourceIdentity();
if (
  initialSource.commit !== finalSource.commit ||
  initialSource.branch !== finalSource.branch ||
  initialSource.treeStateSha256 !== finalSource.treeStateSha256 ||
  initialPnpmLockSha256 !== sha256File(pnpmLock) ||
  initialCargoLockSha256 !== (existsSync(cargoLock) ? sha256File(cargoLock) : null)
) {
  throw new Error("Source or dependency identity changed while the frontend candidate was generated.");
}
const commit = initialSource.commit;
const candidateRoot = path.join(
  repoRoot,
  "EXECUTION",
  "evidence",
  "frontend-v2",
  "MEM-FEV2-10",
  "candidates",
  artifactDigest
);
const evidence = {
  schema: "zharwing.frontend-release-evidence.v2",
  source: {
    commit,
    branch: initialSource.branch,
    dirty: initialSource.dirty,
    treeStateSha256: initialSource.treeStateSha256
  },
  lockfiles: {
    pnpmSha256: sha256File(pnpmLock),
    cargoSha256: existsSync(cargoLock) ? sha256File(cargoLock) : null
  },
  profile,
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    osRelease: os.release()
  },
  invocation: portableCommand(["scripts/generate-frontend-evidence.mjs", ...argumentsList]),
  artifact: {
    root: "apps/desktop/dist",
    sha256: artifactDigest,
    releaseSetSha256: sbomResult.releaseSetDigest,
    files: inventory.length,
    bytes: inventory.reduce((total, file) => total + file.bytes, 0)
  },
  commands: commandEvidence.map(publicCommandEvidence),
  optionalCommands: optionalEvidence.map(publicCommandEvidence),
  supplyChain: {
    dependencyClosureDigest: sbomResult.dependencyClosureDigest,
    sbom: boundOutput(sbomResult.sbom, sbomResult.sbomSha256),
    checksums: boundOutput(sbomResult.checksums, sbomResult.checksumsSha256)
  },
  performance,
  unexpectedSkips: [],
  deferredPlatformValidation
};

mkdirSync(candidateRoot, { recursive: true });
const output = path.join(candidateRoot, `frontend-${commit.slice(0, 12)}-${profile}.json`);
const body = `${JSON.stringify(evidence, null, 2)}\n`;
if (existsSync(output)) {
  if (readFileSync(output, "utf8") !== body) {
    throw new Error("Immutable evidence already exists with different candidate facts.");
  }
} else {
  writeFileSync(output, body, { encoding: "utf8", flag: "wx", mode: 0o600 });
}
console.log(JSON.stringify({
  status: "generated",
  output: relative(output),
  artifactDigest,
  deferredPlatformValidation: deferredPlatformValidation.map((item) => item.gate),
  unexpectedSkips: []
}));

function command(id, args) {
  return { id, args, exact: portableCommand(args) };
}

function runRequiredCommand(specification) {
  const result = run(specification);
  if (result.exitCode !== 0) {
    throw new Error(`Required release gate ${specification.id} failed with exit code ${result.exitCode}.`);
  }
  return { ...result, status: "pass" };
}

function runOptionalCommand(specification, unavailableReason, additions = {}) {
  const result = run(specification, additions);
  if (result.exitCode === 0) return { ...result, status: "pass" };
  if (result.exitCode === 2) {
    return { ...result, status: "deferred_platform_validation", reason: unavailableReason };
  }
  throw new Error(`Requested optional release gate ${specification.id} failed with exit code ${result.exitCode}.`);
}

function run(specification, additions = {}) {
  const started = Date.now();
  const [script, ...args] = specification.args;
  const result = spawnSync(process.execPath, [path.join(repoRoot, script), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    env: releaseEnvironment(additions)
  });
  if (result.error) throw result.error;
  return {
    id: specification.id,
    command: specification.exact,
    exitCode: result.status ?? 1,
    durationMs: Date.now() - started,
    stdout: result.stdout || "",
    stdoutSha256: sha256(Buffer.from(result.stdout || "", "utf8"))
  };
}

function releaseEnvironment(additions = {}) {
  const environment = {};
  for (const name of [
    "PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR",
    "ComSpec", "COMSPEC", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE",
    "LOCALAPPDATA", "APPDATA", "XDG_CACHE_HOME", "NODE_OPTIONS", "CI", "NO_COLOR"
  ]) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return {
    ...environment,
    NODE_ENV: "production",
    ZHARWING_BUILD_PROFILE: profile,
    ZHARWING_PUBLIC_DAEMON_URL: "http://127.0.0.1:37841",
    ...(profile === "personal-preview" ? { ZHARWING_PUBLIC_PROFILE: "personal-preview" } : {}),
    ...additions
  };
}

function publicCommandEvidence(result) {
  const { stdout: _stdout, ...publicResult } = result;
  return publicResult;
}

function parseJsonResult(stdout, owner) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  try {
    return JSON.parse(lines.at(-1));
  } catch {
    throw new Error(`${owner} did not return its bounded JSON result.`);
  }
}

function boundOutput(candidate, expectedSha256) {
  if (typeof candidate !== "string" || !candidate || typeof expectedSha256 !== "string") {
    throw new Error("Supply-chain output metadata is incomplete.");
  }
  const absolute = path.resolve(repoRoot, candidate);
  if (!isInside(repoRoot, absolute) || sha256File(absolute) !== expectedSha256) {
    throw new Error("Supply-chain output digest or location is invalid.");
  }
  return { path: relative(absolute), sha256: expectedSha256 };
}

function readPerformanceEvidence(candidate) {
  if (!candidate) {
    return {
      status: "deferred_platform_validation",
      reason: "bounded-performance-input-not-supplied",
      scenarios: []
    };
  }
  const absolute = path.resolve(repoRoot, candidate);
  const allowedRoot = path.join(
    repoRoot,
    "EXECUTION",
    "evidence",
    "frontend-v2",
    "MEM-FEV2-10",
    "performance-input"
  );
  if (!isInside(allowedRoot, absolute)) throw new Error("Performance input must use the bounded FEV2-10 evidence input directory.");
  const metadata = JSON.parse(readFileSync(absolute, "utf8"));
  if (metadata?.schema !== "zharwing.frontend-performance.v1" || !Array.isArray(metadata.scenarios)) {
    throw new Error("Performance input schema is invalid.");
  }
  const scenarios = metadata.scenarios.map(validateScenario);
  const covered = new Set(scenarios.map((scenario) => scenario.name));
  if (covered.size !== 7) {
    throw new Error("Performance evidence must cover every controlled scenario before it is marked observed.");
  }
  return { status: "observed", scenarios, inputSha256: sha256File(absolute) };
}

function validateScenario(value) {
  const allowedNames = new Set([
    "cold-first-paint",
    "project-switch",
    "session-pagination-200",
    "graph-pan-zoom",
    "semantic-polling",
    "dialog-focus-cycle",
    "lost-request-recovery"
  ]);
  if (!value || !allowedNames.has(value.name) || !["browser", "webview"].includes(value.surface)) {
    throw new Error("Performance scenario identity or surface is invalid.");
  }
  if (!Number.isSafeInteger(value.samples) || value.samples < 3 || value.samples > 10_000) {
    throw new Error("Performance scenario samples is invalid.");
  }
  for (const field of ["p50Ms", "p95Ms"]) {
    if (!Number.isFinite(value[field]) || value[field] < 0 || value[field] > 3_600_000) {
      throw new Error(`Performance scenario ${field} is invalid.`);
    }
  }
  if (value.p50Ms > value.p95Ms) throw new Error("Performance p50 cannot exceed p95.");
  if (!/^synthetic-[a-z0-9-]{1,120}$/.test(value.dataset)) {
    throw new Error("Performance datasets must be bounded synthetic identities.");
  }
  for (const field of ["machineClass", "browserVersion", "warmState"]) {
    if (!boundedLabel(value[field])) {
      throw new Error(`Performance scenario ${field} is invalid.`);
    }
  }
  return {
    name: value.name,
    surface: value.surface,
    dataset: value.dataset,
    machineClass: value.machineClass,
    browserVersion: value.browserVersion,
    warmState: value.warmState,
    samples: value.samples,
    p50Ms: value.p50Ms,
    p95Ms: value.p95Ms
  };
}

function boundedLabel(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 160 &&
    /^[a-z0-9 ._()+-]+$/i.test(value) &&
    !/(?:PRIVATE|SECRET|TOKEN|CREDENTIAL|CANARY|[a-z]:\\|\/home\/|\/users\/)/i.test(value);
}

function boundedRepositoryFile(candidate) {
  const absolute = path.resolve(repoRoot, candidate);
  if (!isInside(repoRoot, absolute)) throw new Error("Tauri sidecar evidence input must remain inside the candidate tree.");
  return absolute;
}

function repeatedOptions(name) {
  const values = [];
  for (let index = 0; index < argumentsList.length; index += 1) {
    if (argumentsList[index] !== name) continue;
    const value = argumentsList[index + 1];
    if (!value) throw new Error(`${name} requires a value.`);
    values.push(name, value);
    index += 1;
  }
  return values;
}

function validateArguments(args) {
  const valueOptions = new Set(["--profile", "--artifact", "--tauri-sidecar", "--performance"]);
  const booleanOptions = new Set(["--browser-smoke"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (booleanOptions.has(argument)) continue;
    if (!valueOptions.has(argument)) throw new Error(`Unknown frontend evidence option: ${argument}`);
    if (!args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    index += 1;
  }
}

function option(name) {
  const index = argumentsList.indexOf(name);
  if (index === -1) return undefined;
  const value = argumentsList[index + 1];
  if (!value) throw new Error(`${name} requires a value.`);
  return value;
}

function deferred(gate, reason) {
  return { gate, status: "deferred_platform_validation", reason };
}

function portableCommand(args) {
  return ["node", ...args].map((value) => /\s/.test(value) ? JSON.stringify(value) : value).join(" ");
}

function isInside(root, candidate) {
  const relativePath = path.relative(path.resolve(root), path.resolve(candidate));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll("\\", "/");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceIdentity() {
  const status = git([
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ".",
    ":(exclude)EXECUTION/evidence/frontend-v2/MEM-FEV2-10/**"
  ]);
  return {
    commit: git(["rev-parse", "HEAD"]),
    branch: git(["branch", "--show-current"]) || "(detached)",
    dirty: status.length > 0,
    treeStateSha256: sha256(Buffer.from(status, "utf8"))
  };
}

function git(args) {
  const result = spawnSync("git", ["-c", `safe.directory=${repoRoot.replaceAll("\\", "/")}`, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) throw new Error("Source identity could not be resolved for release evidence.");
  return result.stdout.trim();
}
