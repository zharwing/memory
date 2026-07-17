import path from "node:path";
import { DEFAULT_MEMORY_ROOT_NAME } from "@aimem/core";
import { normalizePath } from "@aimem/storage";

export interface DaemonConfig {
  host: string;
  port: number;
  authMode: "token" | "none";
  authToken: string;
  memoryRoot: string;
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
    authToken: process.env.AIMEM_AUTH_TOKEN || "local-dev-token",
    memoryRoot: normalizePath(process.env.AIMEM_MEMORY_ROOT || path.join(process.cwd(), DEFAULT_MEMORY_ROOT_NAME))
  };
}

export function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}
