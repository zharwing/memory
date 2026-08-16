import { parseProjectId, projectIdValue } from "@zharwing/memory-core";

export type NavigationSection = "primary" | "utility";
export type TabSection = "work" | "library" | "settings";
export interface NavigationMetadata {
  section: NavigationSection;
  label: string;
  icon: "home" | "repos" | "work" | "library" | "import" | "search" | "setup" | "trash" | "settings";
  order: number;
  activeRouteIds: readonly string[];
}

export interface TabMetadata {
  section: TabSection;
  label: string;
  order: number;
}

export interface ScreenRouteDefinition {
  kind: "screen";
  id: string;
  title: string;
  screen: string;
  path: string;
  legacyPath?: string;
  projectScoped: boolean;
  navigation?: NavigationMetadata;
  tab?: TabMetadata;
}

export interface RedirectRouteDefinition {
  kind: "redirect";
  /** Literal redirect identifiers are derived from APP_ROUTE_REGISTRY. */
  id: string;
  path: string;
  /** The registry factory rejects targets that are not registered screens. */
  target: string;
  preserveProject: boolean;
}

export interface WildcardRouteDefinition {
  kind: "wildcard";
  id: "notFound";
  path: "*";
}

export type RouteDefinition = ScreenRouteDefinition | RedirectRouteDefinition | WildcardRouteDefinition;

type ScreenRouteIdIn<Entries extends readonly RouteDefinition[]> =
  Extract<Entries[number], { readonly kind: "screen" }>["id"];

type RouteEntriesWithValidTargets<Entries extends readonly RouteDefinition[]> = {
  readonly [Index in keyof Entries]: Entries[Index] extends {
    readonly kind: "redirect";
    readonly target: infer Target;
  }
    ? Target extends ScreenRouteIdIn<Entries>
      ? Entries[Index]
      : never
    : Entries[Index];
};

/** Preserves route literals while rejecting redirects to unregistered screens. */
function defineRouteRegistry<const Entries extends readonly RouteDefinition[]>(
  entries: Entries & RouteEntriesWithValidTargets<Entries>
): Entries {
  return entries;
}

/**
 * The only route authority in the desktop application.
 *
 * Route objects, link builders, project-parameter decoding, navigation, tabs,
 * redirects, wildcard recovery, and coverage checks are all derived from this
 * value. Add a route here before adding a consumer.
 */
export const APP_ROUTE_REGISTRY = defineRouteRegistry([
  {
    kind: "redirect", id: "homeRedirect", path: "/", target: "projects", preserveProject: false
  },
  {
    kind: "screen", id: "projects", title: "Projects", screen: "projects", path: "/projects", projectScoped: false
  },
  {
    kind: "screen", id: "setup", title: "Set up a project", screen: "setup", path: "/setup", projectScoped: false,
    navigation: { section: "utility", label: "Setup", icon: "setup", order: 10, activeRouteIds: ["setup"] },
    tab: { section: "settings", label: "Setup", order: 20 }
  },
  {
    kind: "screen", id: "dashboard", title: "Dashboard", screen: "dashboard", path: "/p/:projectId/dashboard", legacyPath: "/dashboard", projectScoped: true,
    navigation: { section: "primary", label: "Dashboard", icon: "home", order: 10, activeRouteIds: ["dashboard"] }
  },
  {
    kind: "screen", id: "repositories", title: "Repositories", screen: "repositories", path: "/p/:projectId/repositories", legacyPath: "/repositories", projectScoped: true,
    navigation: { section: "primary", label: "Repos", icon: "repos", order: 20, activeRouteIds: ["repositories"] }
  },
  {
    kind: "screen", id: "currentWork", title: "Current work", screen: "currentWork", path: "/p/:projectId/work/current-work", legacyPath: "/current-work", projectScoped: true,
    navigation: { section: "primary", label: "Work", icon: "work", order: 30, activeRouteIds: ["currentWork", "sessions", "workstreams"] },
    tab: { section: "work", label: "Current Work", order: 10 }
  },
  {
    kind: "screen", id: "sessions", title: "Sessions", screen: "sessions", path: "/p/:projectId/work/sessions", legacyPath: "/sessions", projectScoped: true,
    tab: { section: "work", label: "Sessions", order: 20 }
  },
  {
    kind: "screen", id: "workstreams", title: "Workstreams", screen: "workstreams", path: "/p/:projectId/work/workstreams", legacyPath: "/workstreams", projectScoped: true,
    tab: { section: "work", label: "Workstreams", order: 30 }
  },
  {
    kind: "screen", id: "docs", title: "Documents", screen: "docs", path: "/p/:projectId/library/docs", legacyPath: "/docs", projectScoped: true,
    navigation: { section: "primary", label: "Library", icon: "library", order: 40, activeRouteIds: ["docs", "diagrams", "inbox", "graph", "context"] },
    tab: { section: "library", label: "Docs", order: 10 }
  },
  {
    kind: "screen", id: "diagrams", title: "Diagrams", screen: "diagrams", path: "/p/:projectId/library/diagrams", legacyPath: "/diagrams", projectScoped: true,
    tab: { section: "library", label: "Diagrams", order: 20 }
  },
  {
    kind: "screen", id: "inbox", title: "Inbox", screen: "inbox", path: "/p/:projectId/library/inbox", legacyPath: "/inbox", projectScoped: true,
    tab: { section: "library", label: "Inbox", order: 30 }
  },
  {
    kind: "screen", id: "graph", title: "Graph", screen: "graph", path: "/p/:projectId/library/graph", legacyPath: "/graph", projectScoped: true,
    tab: { section: "library", label: "Graph", order: 40 }
  },
  {
    kind: "screen", id: "context", title: "Context", screen: "context", path: "/p/:projectId/library/context", legacyPath: "/context", projectScoped: true,
    tab: { section: "library", label: "Context", order: 50 }
  },
  {
    kind: "screen", id: "import", title: "Import", screen: "import", path: "/p/:projectId/import", legacyPath: "/import", projectScoped: true,
    navigation: { section: "primary", label: "Import", icon: "import", order: 50, activeRouteIds: ["import"] }
  },
  {
    kind: "screen", id: "search", title: "Search", screen: "search", path: "/p/:projectId/search", legacyPath: "/search", projectScoped: true,
    navigation: { section: "primary", label: "Search", icon: "search", order: 60, activeRouteIds: ["search"] }
  },
  {
    kind: "screen", id: "settings", title: "Project settings", screen: "settings", path: "/p/:projectId/settings/project", legacyPath: "/settings", projectScoped: true,
    navigation: { section: "utility", label: "Settings", icon: "settings", order: 30, activeRouteIds: ["settings", "assistant", "backups"] },
    tab: { section: "settings", label: "Project", order: 10 }
  },
  {
    kind: "screen", id: "assistant", title: "Assistant settings", screen: "assistant", path: "/p/:projectId/settings/assistant", legacyPath: "/assistant", projectScoped: true,
    tab: { section: "settings", label: "Assistant", order: 30 }
  },
  {
    kind: "screen", id: "backups", title: "Backups", screen: "backups", path: "/p/:projectId/settings/backups", legacyPath: "/backups", projectScoped: true,
    tab: { section: "settings", label: "Backups", order: 40 }
  },
  {
    kind: "screen", id: "trash", title: "Trash", screen: "trash", path: "/p/:projectId/trash", legacyPath: "/trash", projectScoped: true,
    navigation: { section: "utility", label: "Trash", icon: "trash", order: 20, activeRouteIds: ["trash"] }
  },
  { kind: "redirect", id: "legacyWorkRedirect", path: "/work", target: "currentWork", preserveProject: false },
  { kind: "redirect", id: "legacyLibraryRedirect", path: "/library", target: "docs", preserveProject: false },
  { kind: "redirect", id: "projectWorkRedirect", path: "/p/:projectId/work", target: "currentWork", preserveProject: true },
  { kind: "redirect", id: "projectLibraryRedirect", path: "/p/:projectId/library", target: "docs", preserveProject: true },
  { kind: "redirect", id: "projectSettingsRedirect", path: "/p/:projectId/settings", target: "settings", preserveProject: true },
  { kind: "wildcard", id: "notFound", path: "*" }
] as const);

/** Closed route/screen vocabulary, derived from the single literal registry. */
export type AppRouteId = Extract<(typeof APP_ROUTE_REGISTRY)[number], { readonly kind: "screen" }>['id'];
export type AppScreenId = Extract<(typeof APP_ROUTE_REGISTRY)[number], { readonly kind: "screen" }>['screen'];
export type RegisteredRouteId = (typeof APP_ROUTE_REGISTRY)[number]["id"];

export type RouteRegistryEntry = RouteDefinition;

type EmptyRouteQuery = Readonly<Record<never, never>>;

/** Query ownership is closed per route; screens no longer invent generic keys. */
export interface RouteQueryById {
  projects: EmptyRouteQuery;
  setup: EmptyRouteQuery;
  dashboard: EmptyRouteQuery;
  repositories: EmptyRouteQuery;
  currentWork: EmptyRouteQuery;
  sessions: { readonly session?: string };
  workstreams: { readonly workstream?: string };
  docs: { readonly doc?: string };
  diagrams: { readonly doc?: string };
  inbox: { readonly proposal?: string };
  graph: {
    readonly view?: "all";
    readonly relationships?: "deterministic" | "ai-reviewed";
    readonly focus?: string;
    readonly doc?: string;
    readonly edge?: string;
  };
  context: { readonly bundle?: string };
  import: EmptyRouteQuery;
  search: { readonly q?: string };
  settings: EmptyRouteQuery;
  assistant: EmptyRouteQuery;
  backups: EmptyRouteQuery;
  trash: { readonly item?: string };
}

export interface RouteLocationOptions<RouteId extends AppRouteId> {
  readonly projectId?: string;
  readonly query?: RouteQueryById[RouteId];
  readonly hash?: string;
}

export interface RouteNavigationEntry {
  routeId: AppRouteId;
  label: string;
  icon: NavigationMetadata["icon"];
  order: number;
  activeRouteIds: readonly AppRouteId[];
}

export interface RouteTabEntry {
  routeId: AppRouteId;
  label: string;
  order: number;
}

export type DecodedRouteLocation =
  | { status: "matched"; routeId: RegisteredRouteId; projectId?: string }
  | { status: "not_found" }
  | { status: "malformed"; reason: "encoding" | "project" | "length" };

const registry: readonly RouteDefinition[] = APP_ROUTE_REGISTRY;
const screenRoutes = registry.filter(
  (entry): entry is ScreenRouteDefinition & { id: AppRouteId; screen: AppScreenId } => entry.kind === "screen"
);

export function routePath<RouteId extends AppRouteId>(
  routeId: RouteId,
  options: RouteLocationOptions<RouteId> = {}
): string {
  const route = screenRoutes.find((candidate) => candidate.id === routeId);
  if (!route) return "/projects";

  let pathname = route.path;
  if (route.projectScoped) {
    const projectId = normalizeProjectId(options.projectId);
    pathname = projectId
      ? route.path.replace(":projectId", encodeURIComponent(projectId))
      : route.legacyPath ?? "/projects";
  }

  const search = buildRouteSearch(routeId, options.query);
  const hash = buildRouteHash(options.hash);
  return `${pathname}${search}${hash}`;
}

export function navigationRoutes(section: NavigationSection): RouteNavigationEntry[] {
  return screenRoutes
    .filter((route) => route.navigation?.section === section)
    .map((route) => ({
      routeId: route.id,
      label: route.navigation!.label,
      icon: route.navigation!.icon,
      order: route.navigation!.order,
      activeRouteIds: route.navigation!.activeRouteIds as readonly AppRouteId[]
    }))
    .sort((left, right) => left.order - right.order);
}

export function tabRoutes(section: TabSection): RouteTabEntry[] {
  return screenRoutes
    .filter((route) => route.tab?.section === section)
    .map((route) => ({ routeId: route.id, label: route.tab!.label, order: route.tab!.order }))
    .sort((left, right) => left.order - right.order);
}

export function routeIsActive(currentRouteId: string | undefined, activeRouteIds: readonly AppRouteId[]): boolean {
  return currentRouteId ? activeRouteIds.includes(currentRouteId as AppRouteId) : false;
}

export function decodeRouteLocation(pathname: string): DecodedRouteLocation {
  if (pathname.length > 2_048) return { status: "malformed", reason: "length" };
  if (!safeDecodePathname(pathname)) return { status: "malformed", reason: "encoding" };

  for (const route of registry) {
    if (route.kind === "wildcard") continue;
    const patterns = route.kind === "screen" && route.legacyPath
      ? [route.path, route.legacyPath]
      : [route.path];
    for (const pattern of patterns) {
      const match = matchRegisteredPath(pattern, pathname);
      if (!match.matched) continue;
      if (match.projectMalformed) return { status: "malformed", reason: "project" };
      return { status: "matched", routeId: route.id as RegisteredRouteId, projectId: match.projectId };
    }
  }
  if (pathname === "/p" || pathname.startsWith("/p/")) {
    const encodedProjectId = pathname.split("/")[2] ?? "";
    let decodedProjectId = "";
    try {
      decodedProjectId = decodeURIComponent(encodedProjectId);
    } catch {
      return { status: "malformed", reason: "encoding" };
    }
    if (!normalizeProjectId(decodedProjectId)) return { status: "malformed", reason: "project" };
  }
  return { status: "not_found" };
}

export function projectIdFromRegisteredPath(pathname: string): string | undefined {
  const decoded = decodeRouteLocation(pathname);
  return decoded.status === "matched" ? decoded.projectId : undefined;
}

export function currentScreenRouteId(pathname: string): AppRouteId | undefined {
  const decoded = decodeRouteLocation(pathname);
  if (decoded.status !== "matched") return undefined;
  const route = screenRoutes.find((candidate) => candidate.id === decoded.routeId);
  return route?.id;
}

export function parseBoundedSearchParam(
  searchParams: URLSearchParams,
  key: string,
  options: { maximumLength?: number; pattern?: RegExp; preserveWhitespace?: boolean } = {}
): string | undefined {
  const values = searchParams.getAll(key);
  if (values.length !== 1) return undefined;
  const rawValue = values[0];
  if (!rawValue || !rawValue.trim()) return undefined;
  const value = options.preserveWhitespace ? rawValue : rawValue.trim();
  const maximumLength = options.maximumLength ?? 256;
  if (!value || value.length > maximumLength) return undefined;
  if (options.pattern && !options.pattern.test(value)) return undefined;
  return value;
}

/** Parses only the keys owned by the matched route and drops malformed values. */
export function decodeRouteQuery<RouteId extends AppRouteId>(
  routeId: RouteId,
  searchParams: URLSearchParams
): RouteQueryById[RouteId] {
  const result: Record<string, string> = {};
  for (const [key, codec] of Object.entries(ROUTE_QUERY_CODECS[routeId])) {
    const value = parseBoundedSearchParam(searchParams, key, codec);
    if (value) result[key] = value;
  }
  return result as RouteQueryById[RouteId];
}

export function registeredRouteEntries(): readonly RouteRegistryEntry[] {
  return registry;
}

export function assertRouteRegistryIntegrity(): void {
  const paths = new Set<string>();
  const screenIds = new Set(screenRoutes.map((route) => route.id));
  let wildcardCount = 0;

  for (const route of registry) {
    if (route.kind === "wildcard") {
      wildcardCount += 1;
      continue;
    }
    const expandedPaths = route.kind === "screen" && route.legacyPath
      ? [route.path, route.legacyPath]
      : [route.path];
    for (const path of expandedPaths) {
      if (paths.has(path)) throw new Error(`Duplicate registered route path: ${path}`);
      paths.add(path);
    }
    if (route.kind === "redirect" && !screenIds.has(route.target as AppRouteId)) {
      throw new Error(`Redirect ${route.id} has an unregistered target.`);
    }
    if (route.kind === "screen" && route.projectScoped) {
      if (!route.path.includes(":projectId") || !route.legacyPath) {
        throw new Error(`Project route ${route.id} is missing its typed path pair.`);
      }
    }
  }

  for (const route of screenRoutes) {
    for (const activeRouteId of route.navigation?.activeRouteIds ?? []) {
      if (!screenIds.has(activeRouteId as AppRouteId)) {
        throw new Error(`Navigation for ${route.id} references an unregistered route.`);
      }
    }
  }

  if (wildcardCount !== 1) throw new Error("The route registry must own exactly one wildcard route.");
}

assertRouteRegistryIntegrity();

function normalizeProjectId(input: string | undefined): string | undefined {
  return projectIdValue(parseProjectId(input));
}

function safeDecodePathname(pathname: string): boolean {
  try {
    for (const segment of pathname.split("/")) {
      const decoded = decodeURIComponent(segment);
      if (decoded.includes("\0") || decoded.includes("/") || decoded.includes("\\")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function matchRegisteredPath(
  pattern: string,
  pathname: string
): { matched: boolean; projectId?: string; projectMalformed?: boolean } {
  const patternParts = normalizePath(pattern).split("/").filter(Boolean);
  const pathParts = normalizePath(pathname).split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return { matched: false };

  let projectId: string | undefined;
  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index];
    const actual = pathParts[index];
    if (expected === ":projectId") {
      let decoded: string;
      try {
        decoded = decodeURIComponent(actual);
      } catch {
        return { matched: true, projectMalformed: true };
      }
      projectId = normalizeProjectId(decoded);
      if (!projectId) return { matched: true, projectMalformed: true };
      continue;
    }
    if (expected !== actual) return { matched: false };
  }
  return { matched: true, projectId };
}

function normalizePath(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/g, "") || "/";
}

interface RouteQueryFieldCodec {
  readonly maximumLength?: number;
  readonly pattern?: RegExp;
  readonly preserveWhitespace?: boolean;
}

const ROUTE_QUERY_CODECS: Readonly<Record<AppRouteId, Readonly<Record<string, RouteQueryFieldCodec>>>> = {
  projects: {},
  setup: {},
  dashboard: {},
  repositories: {},
  currentWork: {},
  sessions: { session: { maximumLength: 256, preserveWhitespace: true } },
  workstreams: { workstream: { maximumLength: 256, preserveWhitespace: true } },
  docs: { doc: { maximumLength: 512, preserveWhitespace: true } },
  diagrams: { doc: { maximumLength: 512, preserveWhitespace: true } },
  inbox: { proposal: { maximumLength: 256, preserveWhitespace: true } },
  graph: {
    view: { maximumLength: 16, pattern: /^all$/ },
    relationships: { maximumLength: 32, pattern: /^(?:deterministic|ai-reviewed)$/ },
    focus: { maximumLength: 256, preserveWhitespace: true },
    doc: { maximumLength: 512, preserveWhitespace: true },
    edge: { maximumLength: 320, preserveWhitespace: true }
  },
  context: { bundle: { maximumLength: 256, preserveWhitespace: true } },
  import: {},
  search: { q: { maximumLength: 512 } },
  settings: {},
  assistant: {},
  backups: {},
  trash: { item: { maximumLength: 256, preserveWhitespace: true } }
};

function buildRouteSearch<RouteId extends AppRouteId>(
  routeId: RouteId,
  values: RouteQueryById[RouteId] | undefined
): string {
  if (!values) return "";
  const params = new URLSearchParams();
  const codecs = ROUTE_QUERY_CODECS[routeId];
  const record = values as Readonly<Record<string, string | undefined>>;
  for (const key of Object.keys(codecs).sort()) {
    const rawValue = record[key];
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;
    const value = String(rawValue);
    const codec = codecs[key];
    if ((codec.maximumLength && value.length > codec.maximumLength) ||
        (codec.pattern && !codec.pattern.test(value))) continue;
    params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

function buildRouteHash(hash: string | undefined): string {
  const value = hash?.replace(/^#/, "").trim();
  if (!value || value.length > 128 || !/^[A-Za-z0-9._~-]+$/.test(value)) return "";
  return `#${value}`;
}
