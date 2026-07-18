import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_MEMORY_ROOT_NAME } from "@aimem/core";
import { normalizePath } from "@aimem/storage";

export interface DaemonConfig {
  host: string;
  port: number;
  authMode: "token" | "none";
  authToken: string;
  memoryRoot: string;
  /**
   * Agent-facing surfaces (HTTP /mcp, stdio MCP) stay disabled until the
   * privacy facade gate passes. Opt in explicitly with
   * AIMEM_AGENT_SURFACE=enabled.
   */
  agentSurfaceEnabled: boolean;
}

export function loadDaemonConfig(): DaemonConfig {
  const host = process.env.AIMEM_HOST || "127.0.0.1";
  const authMode = process.env.AIMEM_AUTH_MODE === "none" ? "none" : "token";
  if (authMode === "none" && !isLoopbackHost(host)) {
    throw new Error("AIMEM_AUTH_MODE=none is only allowed when AIMEM_HOST is localhost, 127.0.0.1, or ::1.");
  }
  return {
    host,
    port: Number(process.env.AIMEM_PORT || "37841"),
    authMode,
    authToken: authMode === "none" ? "" : resolveAuthToken(),
    memoryRoot: normalizePath(process.env.AIMEM_MEMORY_ROOT || path.join(process.cwd(), DEFAULT_MEMORY_ROOT_NAME)),
    agentSurfaceEnabled: process.env.AIMEM_AGENT_SURFACE === "enabled"
  };
}

/**
 * Token file lives in the OS user state directory, never inside the
 * repository. Windows: %APPDATA%\aimem (per-user ACL by default).
 * POSIX: $XDG_STATE_HOME or ~/.local/state, file mode 0600.
 * Rotate by deleting the file; the next daemon start generates a new token.
 */
export function tokenFilePath(): string {
  if (process.env.AIMEM_TOKEN_FILE) return process.env.AIMEM_TOKEN_FILE;
  const base =
    process.platform === "win32"
      ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
      : process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  return path.join(base, "aimem", "daemon-token");
}

export function resolveAuthToken(): string {
  const fromEnv = process.env.AIMEM_AUTH_TOKEN;
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

export function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}
