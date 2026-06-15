import path from "node:path";
import { DEFAULT_MEMORY_ROOT_NAME } from "@aimem/core";
import { normalizePath } from "@aimem/storage";

export interface DaemonConfig {
  host: string;
  port: number;
  authToken: string;
  memoryRoot: string;
}

export function loadDaemonConfig(): DaemonConfig {
  return {
    host: process.env.AIMEM_HOST || "127.0.0.1",
    port: Number(process.env.AIMEM_PORT || "37841"),
    authToken: process.env.AIMEM_AUTH_TOKEN || "local-dev-token",
    memoryRoot: normalizePath(process.env.AIMEM_MEMORY_ROOT || path.join(process.cwd(), DEFAULT_MEMORY_ROOT_NAME))
  };
}
