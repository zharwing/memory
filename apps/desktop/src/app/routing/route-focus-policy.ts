/**
 * Route focus is intentionally tied to pathname changes. Search-parameter and
 * hash changes often open local panels or dialogs and must not steal focus
 * from the control that initiated them.
 */
export function shouldMoveFocusToRouteHeading(
  previousPathname: string | undefined,
  nextPathname: string
): boolean {
  if (previousPathname === undefined) return true;
  return normalizeRoutePath(previousPathname) !== normalizeRoutePath(nextPathname);
}

function normalizeRoutePath(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/g, "") || "/";
}
