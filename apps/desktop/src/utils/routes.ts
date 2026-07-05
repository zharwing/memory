const PROJECT_PATH_PREFIX = "/p/";

const PROJECT_PATHS: Record<string, string> = {
  "/dashboard": "/dashboard",
  "/repositories": "/repositories",
  "/current-work": "/work/current-work",
  "/sessions": "/work/sessions",
  "/workstreams": "/work/workstreams",
  "/docs": "/library/docs",
  "/diagrams": "/library/diagrams",
  "/inbox": "/library/inbox",
  "/graph": "/library/graph",
  "/context": "/library/context",
  "/import": "/import",
  "/search": "/search",
  "/settings": "/settings/project",
  "/assistant": "/settings/assistant",
  "/backups": "/settings/backups",
  "/trash": "/trash"
};

const LEGACY_PATHS = new Map(Object.entries(PROJECT_PATHS).map(([legacy, scoped]) => [scoped, legacy]));

export function projectIdFromPathname(pathname: string): string | undefined {
  if (!pathname.startsWith(PROJECT_PATH_PREFIX)) return undefined;
  const [rawProjectId] = pathname.slice(PROJECT_PATH_PREFIX.length).split("/");
  return rawProjectId ? decodeURIComponent(rawProjectId) : undefined;
}

export function projectPath(projectId: string | undefined, legacyPath: string): string {
  if (!projectId) return legacyPath;
  const { pathname, suffix } = splitPathSuffix(legacyPath);
  const scopedPath = PROJECT_PATHS[pathname];
  if (!scopedPath) return legacyPath;
  return `/p/${encodeURIComponent(projectId)}${scopedPath}${suffix}`;
}

export function appPathFromPathname(pathname: string): string {
  if (!pathname.startsWith(PROJECT_PATH_PREFIX)) return pathname;
  const parts = pathname.split("/");
  const scopedPath = `/${parts.slice(3).join("/")}`.replace(/\/+$/g, "") || "/";
  return LEGACY_PATHS.get(scopedPath) || scopedPath;
}

function splitPathSuffix(path: string): { pathname: string; suffix: string } {
  const index = path.search(/[?#]/);
  if (index === -1) return { pathname: path, suffix: "" };
  return {
    pathname: path.slice(0, index),
    suffix: path.slice(index)
  };
}
