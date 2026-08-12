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
  profile: "personal-preview" | "hardened-local";
  authMode: "token" | "none";
  authToken: string;
  memoryRoot: string;
  /**
   * Agent-facing surfaces (HTTP /mcp, stdio MCP) stay disabled until the
   * privacy facade gate passes. Opt in explicitly with
   * ZHARWING_MEMORY_AGENT_SURFACE=enabled.
   */
  agentSurfaceEnabled: boolean;
  /** Distinct trusted-host bearer for the hardened agent audience. */
  agentCredential?: string;
  /** Exact project bound to agentCredential for this daemon process. */
  agentProjectId?: string;
  /** Rust/native-host credential exchanged through a one-shot OS temp file. */
  desktopCredential?: string;
  /** Exact project selected by the native host; null/absent permits global discovery only. */
  desktopProjectId?: string;
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
  const profile = rawProfile();
  const authMode = memoryEnv("ZHARWING_MEMORY_AUTH_MODE") === "none" ? "none" : "token";
  if (authMode === "none" && !isLoopbackHost(host)) {
    throw new Error(
      "ZHARWING_MEMORY_AUTH_MODE=none is only allowed when ZHARWING_MEMORY_HOST is localhost, 127.0.0.1, or ::1."
    );
  }
  if (profile === "hardened-local" && authMode !== "token") {
    throw new Error("The hardened-local profile requires token/session authentication.");
  }
  if (profile === "hardened-local" && !isLoopbackHost(host)) {
    throw new Error("The hardened-local profile must bind to an exact loopback host.");
  }
  const agentSurfaceEnabled = memoryEnv("ZHARWING_MEMORY_AGENT_SURFACE") === "enabled";
  const agentCredential = directEnv("ZHARWING_MEMORY_AGENT_CREDENTIAL");
  const agentProjectId = directEnv("ZHARWING_MEMORY_AGENT_PROJECT_ID");
  if (profile === "hardened-local" && agentSurfaceEnabled && (!agentCredential || !agentProjectId)) {
    throw new Error(
      "Hardened agent provisioning requires both ZHARWING_MEMORY_AGENT_CREDENTIAL and ZHARWING_MEMORY_AGENT_PROJECT_ID."
    );
  }
  const desktopCredentialFile = directDesktopEnv("ZHARWING_MEMORY_DESKTOP_CREDENTIAL_FILE");
  const desktopProjectId = directDesktopEnv("ZHARWING_MEMORY_DESKTOP_PROJECT_ID");
  if (desktopProjectId && !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(desktopProjectId)) {
    throw new Error("The native desktop project binding is invalid.");
  }
  if (desktopProjectId && !desktopCredentialFile) {
    throw new Error("A desktop project binding requires the native one-shot credential exchange.");
  }
  if (desktopCredentialFile && profile !== "hardened-local") {
    throw new Error("The native desktop authority requires the hardened-local profile.");
  }
  const desktopCredential = desktopCredentialFile
    ? issueDesktopCredential(desktopCredentialFile)
    : undefined;
  return {
    host,
    port: Number(memoryEnv("ZHARWING_MEMORY_PORT") || DEFAULT_DAEMON_PORT),
    profile,
    authMode,
    authToken: authMode === "none" ? "" : resolveAuthToken(),
    memoryRoot: normalizePath(
      memoryEnv("ZHARWING_MEMORY_ROOT") || path.join(process.cwd(), DEFAULT_MEMORY_ROOT_NAME)
    ),
    agentSurfaceEnabled,
    ...(agentCredential ? { agentCredential } : {}),
    ...(agentProjectId ? { agentProjectId } : {}),
    ...(desktopCredential ? { desktopCredential } : {}),
    ...(desktopProjectId ? { desktopProjectId } : {})
  };
}

function directEnv(name: "ZHARWING_MEMORY_AGENT_CREDENTIAL" | "ZHARWING_MEMORY_AGENT_PROJECT_ID"): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function directDesktopEnv(
  name: "ZHARWING_MEMORY_DESKTOP_CREDENTIAL_FILE" | "ZHARWING_MEMORY_DESKTOP_PROJECT_ID"
): string | undefined {
  const value = process.env[name]?.trim();
  delete process.env[name];
  return value ? value : undefined;
}

function issueDesktopCredential(exchangeFile: string): string {
  const resolvedFile = path.resolve(exchangeFile);
  const resolvedTemp = path.resolve(os.tmpdir());
  if (
    path.dirname(resolvedFile).toLocaleLowerCase() !== resolvedTemp.toLocaleLowerCase() ||
    !/^zharwing-memory-desktop-[a-z0-9-]+\.credential$/i.test(path.basename(resolvedFile))
  ) {
    throw new Error("The desktop credential exchange must be a fresh file in the OS temp directory.");
  }

  const credential = crypto.randomBytes(32).toString("hex");
  let handle: number | undefined;
  let failed = false;
  try {
    handle = fs.openSync(resolvedFile, "wx", 0o600);
    fs.writeFileSync(handle, `${credential}\n`, { encoding: "utf8" });
    fs.fsyncSync(handle);
  } catch {
    failed = true;
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
  if (failed) {
    try { fs.unlinkSync(resolvedFile); } catch { /* Nothing safe to retain. */ }
    throw new Error("The desktop credential exchange could not be created safely.");
  }
  return credential;
}

function rawProfile(): DaemonConfig["profile"] {
  // Profile is public configuration, not a credential. Keep the preview as
  // the compatibility default until the separately governed migration makes
  // hardened-local the product default.
  const value = process.env.ZHARWING_MEMORY_PROFILE;
  if (value === undefined || value === "" || value === "personal-preview") {
    return "personal-preview";
  }
  if (value === "hardened-local") return value;
  throw new Error("ZHARWING_MEMORY_PROFILE must be personal-preview or hardened-local.");
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
