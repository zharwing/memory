/**
 * Guarded localStorage helpers. All functions are no-ops (or return
 * undefined) when `window` or browser storage is unavailable, so callers
 * never have to wrap storage access in their own try/catch.
 */

export function readString(key: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? undefined : value;
  } catch {
    return undefined;
  }
}

export function writeString(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Browser storage can be unavailable in hardened contexts.
  }
}

export function readJson<T>(key: string): T | undefined {
  const raw = readString(key);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeString(key, JSON.stringify(value));
  } catch {
    // Serialization failures should never break the UI.
  }
}

export function remove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Browser storage can be unavailable in hardened contexts.
  }
}
