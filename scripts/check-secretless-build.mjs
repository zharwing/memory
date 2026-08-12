import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { inventoryArtifacts, scanArtifactText } from "./lib/artifact-scan.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const desktopDist = path.join(repoRoot, "apps", "desktop", "dist");
const scanExistingOnly = process.argv.slice(2).includes("--scan-existing");
const scans = [];

scanBuild(desktopDist, "candidate-build");

let isolatedRoot;
try {
  if (!scanExistingOnly) {
    const viteCli = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
    if (!existsSync(viteCli)) {
      throw new Error("Vite is unavailable in the approved dependency closure; the secretless canary build cannot run.");
    }
    isolatedRoot = mkdtempSync(path.join(os.tmpdir(), "zharwing-secretless-build-"));
    const isolatedDist = path.join(isolatedRoot, "dist");
    const result = spawnSync(process.execPath, [
      viteCli,
      "build",
      "--config",
      path.join(repoRoot, "apps", "desktop", "vite.config.ts"),
      "--outDir",
      isolatedDist,
      "--emptyOutDir"
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: syntheticBuildEnvironment()
    });
    if (result.status !== 0) {
      throw new Error(
        `The isolated secretless canary build failed with exit code ${result.status ?? "unknown"}.` +
        `\n${boundedBuildFailure(result.stderr, result.stdout)}`
      );
    }
    scanBuild(isolatedDist, "synthetic-canary-build");
  }
} finally {
  if (isolatedRoot) rmSync(isolatedRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({
  status: "pass",
  mode: scanExistingOnly ? "existing-artifact" : "existing-plus-isolated-canary",
  scans,
  realSecretsRead: false
}));

function scanBuild(root, label) {
  const inventory = inventoryArtifacts(root);
  const findings = scanArtifactText(inventory, {
    patterns: [
      {
        id: "browser-credential-name",
        pattern: /(?:VITE_|ZHARWING_PUBLIC_|ZHARWING_MEMORY_|AIMEM_)[A-Z0-9_]*(?:AUTH|TOKEN|CREDENTIAL|SECRET|PASSWORD|PRIVATE_KEY|API_KEY)[A-Z0-9_]*/i
      },
      { id: "agent-credential-name", pattern: /ZHARWING_MEMORY_AGENT_CREDENTIAL/i },
      { id: "native-credential-name", pattern: /ZHARWING_MEMORY_DESKTOP_CREDENTIAL/i },
      {
        id: "provider-secret-name",
        // Credential environment names are intentionally uppercase. Keep
        // lower-case public error/message identifiers such as
        // `provider_secret` out of this emitted-artifact rule.
        pattern: /\b(?:PROVIDER|OPENAI|ANTHROPIC|CLAUDE|OLLAMA)_(?:API_)?(?:KEY|TOKEN|SECRET)\b/
      },
      { id: "synthetic-env-canary", pattern: /zharwing-build-secret-canary-v1/i },
      { id: "synthetic-provider-canary", pattern: /sk-proj-ZHARWING_SYNTHETIC_CANARY/i },
      { id: "synthetic-jwt-canary", pattern: /eyJhbGciOiJIUzI1NiJ9\.ZHARWING_SYNTHETIC_CANARY/i }
    ]
  });
  if (findings.length) {
    throw new Error(`Secretless ${label} scan failed:\n${findings.map((item) => `- ${item.rule}: ${item.path}`).join("\n")}`);
  }
  scans.push({ label, filesScanned: inventory.length });
}

function boundedBuildFailure(stderr, stdout) {
  const detail = `${stderr ?? ""}\n${stdout ?? ""}`
    .replaceAll("zharwing-build-secret-canary-v1", "[REDACTED]")
    .replaceAll("sk-proj-ZHARWING_SYNTHETIC_CANARY", "[REDACTED]")
    .replaceAll("eyJhbGciOiJIUzI1NiJ9.ZHARWING_SYNTHETIC_CANARY", "[REDACTED]")
    .trim();
  return detail.length > 4_000 ? detail.slice(-4_000) : detail;
}

function syntheticBuildEnvironment() {
  const environment = {};
  // Copy only process-launch/runtime variables. Arbitrary environment entries
  // are intentionally not inherited because proving a secretless build must
  // not require reading or forwarding actual credential values.
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
    ZHARWING_PUBLIC_DAEMON_URL: "http://127.0.0.1:37841",
    ZHARWING_PUBLIC_PROFILE: "personal-preview",
    ZHARWING_MEMORY_AUTH_TOKEN: "zharwing-build-secret-canary-v1",
    VITE_ZHARWING_MEMORY_AUTH_TOKEN: "zharwing-build-secret-canary-v1",
    ZHARWING_MEMORY_AGENT_CREDENTIAL: "zharwing-build-secret-canary-v1",
    ZHARWING_MEMORY_DESKTOP_CREDENTIAL: "zharwing-build-secret-canary-v1",
    OPENAI_API_KEY: "sk-proj-ZHARWING_SYNTHETIC_CANARY",
    ZHARWING_SYNTHETIC_JWT: "eyJhbGciOiJIUzI1NiJ9.ZHARWING_SYNTHETIC_CANARY"
  };
}
