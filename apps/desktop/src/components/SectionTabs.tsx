import { NavLink, useLocation } from "react-router-dom";
import { useStore } from "../stores/store-context.js";
import {
  currentScreenRouteId,
  registeredRouteEntries,
  routePath,
  tabRoutes,
  type AppRouteId,
  type RouteTabEntry,
  type TabSection
} from "../utils/routes.js";
import { pendingInboxReviewCount } from "../utils/inbox.js";

export function WorkTabs() {
  return <RegisteredSectionTabs section="work" />;
}

export function LibraryTabs() {
  const store = useStore();
  const pendingInboxCount = pendingInboxReviewCount(store.inbox.items);
  return <RegisteredSectionTabs section="library" badges={{ inbox: pendingInboxCount }} />;
}

export function SettingsTabs() {
  return <RegisteredSectionTabs section="settings" />;
}

/**
 * Compatibility surface for existing extensions. Paths are resolved back to
 * registered IDs before any link is rendered; unregistered tabs are omitted.
 */
export function SectionTabs({
  tabs,
  badges = {}
}: {
  tabs: readonly (readonly [string, string])[];
  badges?: Record<string, number>;
}) {
  const registered = tabs.flatMap(([fallbackLabel, path], order): RouteTabEntry[] => {
    const route = registeredRouteEntries().find(
      (candidate) => candidate.kind === "screen" && candidate.legacyPath === path
    );
    return route?.kind === "screen"
      ? [{ routeId: route.id as AppRouteId, label: route.tab?.label ?? fallbackLabel, order }]
      : [];
  });
  const routeBadges = Object.fromEntries(registered.map((entry) => [entry.routeId, badges[legacyPathFor(entry.routeId)] ?? 0]));
  return <RouteTabs entries={registered} badges={routeBadges} />;
}

function RegisteredSectionTabs({
  section,
  badges = {}
}: {
  section: TabSection;
  badges?: Partial<Record<AppRouteId, number>>;
}) {
  return <RouteTabs entries={tabRoutes(section)} badges={badges} />;
}

function RouteTabs({
  entries,
  badges
}: {
  entries: readonly RouteTabEntry[];
  badges: Partial<Record<AppRouteId, number>>;
}) {
  const store = useStore();
  const location = useLocation();
  const currentRouteId = currentScreenRouteId(location.pathname);
  return (
    <nav className="section-tabs" aria-label="Section navigation">
      {entries.map((entry) => (
        <NavLink
          aria-current={currentRouteId === entry.routeId ? "page" : undefined}
          key={entry.routeId}
          to={routePath(entry.routeId, { projectId: store.projects.selectedProjectId })}
          className={() => `section-tab ${currentRouteId === entry.routeId ? "active" : ""}`}
        >
          {entry.label}
          {(badges[entry.routeId] ?? 0) > 0 ? <small>{badges[entry.routeId]}</small> : null}
        </NavLink>
      ))}
    </nav>
  );
}

function legacyPathFor(routeId: AppRouteId): string {
  const route = registeredRouteEntries().find(
    (candidate) => candidate.kind === "screen" && candidate.id === routeId
  );
  return route?.kind === "screen" ? route.legacyPath ?? route.path : "";
}
