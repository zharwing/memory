import { spawnSync } from "node:child_process";
import path from "node:path";
import { installTauriSidecar } from "./lib/tauri-sidecar.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const manifest = path.join(repoRoot, "apps", "desktop", "src-tauri", "Cargo.toml");
const sidecar = installTauriSidecar({
  repoRoot,
  source: process.env.ZHARWING_MEMORY_DAEMON_SIDECAR,
  gate: "tauri-rust-test"
});

try {
  const result = spawnSync("cargo", ["test", "--locked", "--manifest-path", manifest], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error(`Cargo tests failed with exit code ${result.status ?? "unknown"}.`);
  }
  console.log(JSON.stringify({
    status: "pass",
    targetTriple: sidecar.targetTriple,
    sidecarSha256: sidecar.sha256
  }));
} finally {
  sidecar.cleanup();
}
