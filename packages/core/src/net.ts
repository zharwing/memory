export const DEFAULT_DAEMON_HOST = "127.0.0.1";
export const DEFAULT_DAEMON_PORT = 37841;
export const DEFAULT_DAEMON_URL = `http://${DEFAULT_DAEMON_HOST}:${DEFAULT_DAEMON_PORT}`;

/**
 * True when the host names the local machine. Union of the daemon-side
 * checks: "localhost", any "*.localhost" subdomain, "127.0.0.1", and IPv6
 * loopback in both bare ("::1") and bracketed ("[::1]") forms.
 */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".localhost")
  );
}

/**
 * True when the URL names a loopback endpoint. Invalid URLs are treated as
 * non-local so callers fail closed.
 */
export function isLocalProviderEndpoint(endpoint: string): boolean {
  try {
    return isLoopbackHost(new URL(endpoint).hostname);
  } catch {
    return false;
  }
}
