import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync
} from "node:fs";
import path from "node:path";

const MAXIMUM_SIDECAR_BYTES = 256 * 1024 * 1024;

export function installTauriSidecar({ repoRoot, source, gate }) {
  if (process.platform !== "win32") {
    defer(gate, "The governed native qualification lane currently requires pinned Windows.");
  }
  if (!source || !path.isAbsolute(source)) {
    defer(gate, "Native qualification requires an explicit absolute daemon sidecar candidate.");
  }

  const sourceStat = lstatSync(source);
  if (
    !sourceStat.isFile()
    || sourceStat.isSymbolicLink()
    || sourceStat.size <= 0
    || sourceStat.size > MAXIMUM_SIDECAR_BYTES
  ) {
    throw new Error("Daemon sidecar candidate must be a bounded regular file.");
  }

  const rustc = spawnSync("rustc", ["-vV"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (rustc.status !== 0) {
    defer(gate, "Rust target discovery is unavailable in this environment.");
  }
  const targetTriple = /^host:\s*(\S+)$/m.exec(rustc.stdout)?.[1];
  if (!targetTriple || !/^[a-z0-9_.-]+$/i.test(targetTriple)) {
    defer(gate, "Rust target discovery did not return a supported target triple.");
  }

  const binariesDir = path.join(repoRoot, "apps", "desktop", "src-tauri", "binaries");
  const target = path.join(binariesDir, `zharwing-memory-daemon-${targetTriple}.exe`);
  mkdirSync(binariesDir, { recursive: true });
  copyFileSync(source, target, constants.COPYFILE_EXCL);

  let cleaned = false;
  return {
    target,
    targetTriple,
    sha256: createHash("sha256").update(readFileSync(target)).digest("hex"),
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      rmSync(target, { force: true });
      try {
        rmdirSync(binariesDir);
      } catch {
        // Preserve a non-empty directory owned by another process or checkout.
      }
    }
  };
}

export function defer(gate, reason) {
  console.error(JSON.stringify({ status: "deferred_platform_validation", gate, reason }));
  process.exit(2);
}
