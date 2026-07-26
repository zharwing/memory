/**
 * Canonical ZHARWING_MEMORY_* environment variable names with their legacy
 * pre-rename AIMEM_* fallbacks. Canonical names win; legacy names remain
 * readable for one transition release so existing .env files keep working.
 */
export const MEMORY_ENV_FALLBACKS = {
  ZHARWING_MEMORY_AGENT_SURFACE: "AIMEM_AGENT_SURFACE",
  ZHARWING_MEMORY_AUTH_MODE: "AIMEM_AUTH_MODE",
  ZHARWING_MEMORY_AUTH_TOKEN: "AIMEM_AUTH_TOKEN",
  ZHARWING_MEMORY_DAEMON_URL: "AIMEM_DAEMON_URL",
  ZHARWING_MEMORY_HOST: "AIMEM_HOST",
  ZHARWING_MEMORY_PORT: "AIMEM_PORT",
  ZHARWING_MEMORY_ROOT: "AIMEM_MEMORY_ROOT",
  ZHARWING_MEMORY_TOKEN_FILE: "AIMEM_TOKEN_FILE"
} as const;

export type MemoryEnvName = keyof typeof MEMORY_ENV_FALLBACKS;

export function legacyMemoryEnvName(name: MemoryEnvName): string {
  return MEMORY_ENV_FALLBACKS[name];
}

/**
 * Resolves a memory env var from process.env, preferring the canonical name
 * and falling back to the legacy AIMEM_* name. Empty strings count as unset.
 * Guarded via globalThis so it is safe to call in browser bundles (returns
 * undefined when no process.env exists).
 */
export function memoryEnv(name: MemoryEnvName): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  if (!env) return undefined;
  const current = env[name];
  if (current !== undefined && current !== "") return current;
  const legacy = env[MEMORY_ENV_FALLBACKS[name]];
  if (legacy !== undefined && legacy !== "") return legacy;
  return undefined;
}
