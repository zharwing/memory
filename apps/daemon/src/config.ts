import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_DAEMON_HOST,
  DEFAULT_DAEMON_PORT,
  DEFAULT_MEMORY_ROOT_NAME,
  isLoopbackHost,
  legacyMemoryEnvName,
  memoryEnv as coreMemoryEnv,
  type MemoryEnvName
} from "@zharwing/memory-core";
import { normalizePath } from "@zharwing/memory-store";

export interface DaemonConfig {
  host: string;
  port: number;
  authMode: "token" | "none";
  authToken: string;
  memoryRoot: string;
  /**
   * Agent-facing surfaces (HTTP /mcp, stdio MCP) stay disabled until the
   * privacy facade gate passes. Opt in explicitly with
   * ZHARWING_MEMORY_AGENT_SURFACE=enabled.
   */
  agentSurfaceEnabled: boolean;
}

const warnedLegacyEnv = new Set<string>();

/**
 * Reads the canonical ZHARWING_MEMORY_* variable, falling back to the legacy
 * AIMEM_* name for one transition release. Resolution is delegated to core's
 * memoryEnv; this wrapper only adds the daemon-side deprecation warning, once
 * per variable, so existing .env files keep working while users migrate.
 */
export function memoryEnv(name: MemoryEnvName): string | undefined {
  const value = coreMemoryEnv(name);
  const canonical = process.env[name];
  if (value !== undefined && (canonical === undefined || canonical === "")) {
    const legacyName = legacyMemoryEnvName(name);
    if (!warnedLegacyEnv.has(legacyName)) {
      warnedLegacyEnv.add(legacyName);
      console.warn(`zharwing-memory: ${legacyName} is deprecated; rename it to ${name}.`);
    }
  }
  return value;
}

export function loadDaemonConfig(): DaemonConfig {
  const host = memoryEnv("ZHARWING_MEMORY_HOST") || DEFAULT_DAEMON_HOST;
  const authMode = memoryEnv("ZHARWING_MEMORY_AUTH_MODE") === "none" ? "none" : "token";
  if (authMode === "none" && !isLoopbackHost(host)) {
    throw new Error(
      "ZHARWING_MEMORY_AUTH_MODE=none is only allowed when ZHARWING_MEMORY_HOST is localhost, 127.0.0.1, or ::1."
    );
  }
  return {
    host,
    port: Number(memoryEnv("ZHARWING_MEMORY_PORT") || DEFAULT_DAEMON_PORT),
    authMode,
    authToken: authMode === "none" ? "" : resolveAuthToken(),
    memoryRoot: normalizePath(
      memoryEnv("ZHARWING_MEMORY_ROOT") || path.join(process.cwd(), DEFAULT_MEMORY_ROOT_NAME)
    ),
    agentSurfaceEnabled: memoryEnv("ZHARWING_MEMORY_AGENT_SURFACE") === "enabled"
  };
}

/**
 * Token file lives in the OS user state directory, never inside the
 * repository. Windows: %APPDATA%\zharwing-memory (per-user ACL by default).
 * POSIX: $XDG_STATE_HOME or ~/.local/state, file mode 0600.
 * Rotate by deleting the file; the next daemon start generates a new token.
 * A token file created by the pre-rename "aimem" daemon keeps working: the
 * legacy path is used as long as it exists so configured agents keep their
 * token across the rename.
 */
export function tokenFilePath(): string {
  const fromEnv = memoryEnv("ZHARWING_MEMORY_TOKEN_FILE");
  if (fromEnv) return fromEnv;
  const base =
    process.platform === "win32"
      ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
      : process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  const current = path.join(base, "zharwing-memory", "daemon-token");
  if (fs.existsSync(current)) return current;
  const legacy = path.join(base, "aimem", "daemon-token");
  if (fs.existsSync(legacy)) return legacy;
  return current;
}

export function resolveAuthToken(): string {
  const fromEnv = memoryEnv("ZHARWING_MEMORY_AUTH_TOKEN");
  if (fromEnv) return fromEnv;

  const file = tokenFilePath();
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) return existing;
  } catch {
    // Missing or unreadable file falls through to generation.
  }

  const token = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  return token;
}
