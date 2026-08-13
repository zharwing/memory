import { createContext, type ReactNode, useContext } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  currentScreenRouteId,
  registeredRouteEntries,
  routePath,
  tabRoutes,
  type AppRouteId,
  type RouteTabEntry,
  type TabSection
} from "../utils/routes.js";

interface SectionNavigationValue {
  readonly projectId?: string;
  readonly pendingInboxCount: number;
}

const SectionNavigationContext = createContext<SectionNavigationValue | null>(null);

export function SectionNavigationProvider({
  projectId,
  pendingInboxCount,
  children
}: SectionNavigationValue & { children: ReactNode }) {
  return (
    <SectionNavigationContext.Provider value={{ projectId, pendingInboxCount }}>
      {children}
    </SectionNavigationContext.Provider>
  );
}

export function WorkTabs() {
  return <RegisteredSectionTabs section="work" />;
}

export function LibraryTabs() {
  const { pendingInboxCount } = useSectionNavigation();
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
  const { projectId } = useSectionNavigation();
  const location = useLocation();
  const currentRouteId = currentScreenRouteId(location.pathname);
  return (
    <nav className="section-tabs" aria-label="Section navigation">
      {entries.map((entry) => (
        <NavLink
          aria-current={currentRouteId === entry.routeId ? "page" : undefined}
          key={entry.routeId}
          to={routePath(entry.routeId, { projectId })}
          className={() => `section-tab ${currentRouteId === entry.routeId ? "active" : ""}`}
        >
          {entry.label}
          {(badges[entry.routeId] ?? 0) > 0 ? <small>{badges[entry.routeId]}</small> : null}
        </NavLink>
      ))}
    </nav>
  );
}

function useSectionNavigation(): SectionNavigationValue {
  const navigation = useContext(SectionNavigationContext);
  if (!navigation) throw new Error("SectionNavigationProvider is missing.");
  return navigation;
}

function legacyPathFor(routeId: AppRouteId): string {
  const route = registeredRouteEntries().find(
    (candidate) => candidate.kind === "screen" && candidate.id === routeId
  );
  return route?.kind === "screen" ? route.legacyPath ?? route.path : "";
}
