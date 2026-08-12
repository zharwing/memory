import type { BrowserSessionPort } from "../../app/composition/ports.js";

export interface BrowserLocationPort {
  readonly hash: string;
  readonly pathname: string;
  readonly search: string;
}

export interface BrowserHistoryPort {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

/**
 * Reads a launcher bootstrap code only from the URL fragment, then removes the
 * fragment before any network exchange so it cannot enter request logs.
 */
export function consumeBrowserBootstrapCode(
  location: BrowserLocationPort = globalThis.location,
  history: BrowserHistoryPort = globalThis.history
): string | undefined {
  const fragment = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const code = new URLSearchParams(fragment).get("bootstrap") ?? undefined;
  if (!code) return undefined;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  return code;
}

export async function bootstrapBrowserSessionFromLocation(
  session: BrowserSessionPort,
  location: BrowserLocationPort = globalThis.location,
  history: BrowserHistoryPort = globalThis.history,
  signal?: AbortSignal
): Promise<boolean> {
  const code = consumeBrowserBootstrapCode(location, history);
  if (!code) return false;
  await session.bootstrap(code, signal);
  return true;
}
