import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

interface SearchParamSetOptions {
  replace?: boolean;
}

/**
 * Binds a single URL search-param key to a `[value, setValue]` pair.
 * `value` is derived from the current URL (empty string when absent);
 * `setValue(null)` or `setValue("")` removes the key.
 */
export function useSearchParamState(
  key: string
): [string, (value: string | null, options?: SearchParamSetOptions) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key) || "";

  const setValue = useCallback(
    (nextValue: string | null, options?: SearchParamSetOptions) => {
      setSearchParams((current) => {
        const nextParams = new URLSearchParams(current);
        if (nextValue) nextParams.set(key, nextValue);
        else nextParams.delete(key);
        return nextParams;
      }, { replace: options?.replace });
    },
    [key, setSearchParams]
  );

  return [value, setValue];
}

/**
 * Multi-key variant for screens that keep several pieces of state in the URL.
 * Patch semantics per key: string sets, `null`/empty string deletes,
 * `undefined` leaves the key untouched.
 */
export function useSearchParamsPatch(): [
  URLSearchParams,
  (patch: Record<string, string | null | undefined>, options?: SearchParamSetOptions) => void
] {
  const [searchParams, setSearchParams] = useSearchParams();

  const patchSearchParams = useCallback(
    (patch: Record<string, string | null | undefined>, options?: SearchParamSetOptions) => {
      setSearchParams((current) => {
        const nextParams = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) continue;
          if (value) nextParams.set(key, value);
          else nextParams.delete(key);
        }
        return nextParams;
      }, { replace: options?.replace });
    },
    [setSearchParams]
  );

  return [searchParams, patchSearchParams];
}

/**
 * Closes a selection when the selected record disappears from its backing
 * list, e.g. after a delete finishes or the project switches. Pass
 * `missing` as "the list is loaded and no longer contains this id".
 */
export function useCloseWhenMissing(id: string, missing: boolean, close: () => void): void {
  useEffect(() => {
    if (id && missing) close();
    // `close` is intentionally omitted: it is a fresh closure every render.
  }, [id, missing]);
}
