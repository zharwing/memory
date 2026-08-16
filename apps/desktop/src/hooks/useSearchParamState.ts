import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  decodeRouteQuery,
  type AppRouteId,
  type RouteQueryById
} from "../app/routing/route-registry.js";

interface SearchParamSetOptions {
  replace?: boolean;
}

/**
 * Binds a single URL search-param key to a `[value, setValue]` pair.
 * `value` is derived from the current URL (empty string when absent);
 * `setValue(null)` or `setValue("")` removes the key.
 */
export function useRouteQueryParam<
  RouteId extends AppRouteId,
  Key extends keyof RouteQueryById[RouteId] & string
>(
  routeId: RouteId,
  key: Key
): [string, (value: string | null, options?: SearchParamSetOptions) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const decoded = decodeRouteQuery(routeId, searchParams);
  const value = typeof decoded[key] === "string" ? decoded[key] as string : "";

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
export type RouteQueryPatch<RouteId extends AppRouteId> = {
  -readonly [Key in keyof RouteQueryById[RouteId]]?: string | null;
};

export function useRouteQueryPatch<RouteId extends AppRouteId>(routeId: RouteId): [
  URLSearchParams,
  RouteQueryById[RouteId],
  (patch: RouteQueryPatch<RouteId>, options?: SearchParamSetOptions) => void
] {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = decodeRouteQuery(routeId, searchParams);

  const patchSearchParams = useCallback(
    (patch: RouteQueryPatch<RouteId>, options?: SearchParamSetOptions) => {
      setSearchParams((current) => {
        const nextParams = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) continue;
          if (value) nextParams.set(key, String(value));
          else nextParams.delete(key);
        }
        return nextParams;
      }, { replace: options?.replace });
    },
    [setSearchParams]
  );

  return [searchParams, query, patchSearchParams];
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
