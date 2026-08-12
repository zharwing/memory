import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { defer, installTauriSidecar } from "./lib/tauri-sidecar.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const desktopDir = path.join(repoRoot, "apps", "desktop");
const tauriCli = path.join(desktopDir, "node_modules", "@tauri-apps", "cli", "tauri.js");
const viteCli = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
const sidecarSource = process.env.ZHARWING_MEMORY_DAEMON_SIDECAR;

if (!existsSync(tauriCli)) {
  defer("tauri-package", "Tauri CLI is unavailable in the approved dependency closure.");
}

const sidecar = installTauriSidecar({ repoRoot, source: sidecarSource, gate: "tauri-package" });
try {
  runNode(viteCli, ["build", "--config", path.join(desktopDir, "vite.config.ts")]);
  runNode(path.join(repoRoot, "scripts", "check-bundle-size.mjs"));
  runNode(path.join(repoRoot, "scripts", "check-secretless-build.mjs"), ["--scan-existing"]);
  const result = spawnSync(process.execPath, [tauriCli, "build", ...process.argv.slice(2)], {
    cwd: desktopDir,
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) throw new Error(`Tauri build failed with exit code ${result.status ?? "unknown"}.`);
  console.log(JSON.stringify({
    status: "pass",
    targetTriple: sidecar.targetTriple,
    sidecarSha256: sidecar.sha256
  }));
} finally {
  sidecar.cleanup();
}

function runNode(entry, args = []) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error(`${path.basename(entry)} failed with exit code ${result.status ?? "unknown"}.`);
  }
}
