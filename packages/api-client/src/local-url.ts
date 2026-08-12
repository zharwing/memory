/** Parses a configured daemon URL once and closes bootstrap/credential egress. */
export function normalizeLocalDaemonBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The daemon URL must be an absolute local HTTP(S) origin.");
  }
  const host = url.hostname.toLowerCase();
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]" && host !== "::1") ||
    !url.port ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("The daemon URL must be an exact loopback origin with an explicit port.");
  }
  return url.origin;
}
