/**
 * Public route facade. Every value is owned by the typed registry; legacy
 * string-builder and pathname-translation shims were removed after production
 * consumers migrated to route IDs.
 */
export {
  APP_ROUTE_REGISTRY,
  assertRouteRegistryIntegrity,
  currentScreenRouteId,
  decodeRouteLocation,
  navigationRoutes,
  parseBoundedSearchParam,
  projectIdFromRegisteredPath,
  registeredRouteEntries,
  routeIsActive,
  routePath,
  tabRoutes,
  type AppRouteId,
  type DecodedRouteLocation,
  type NavigationSection,
  type RouteLocationOptions,
  type RouteNavigationEntry,
  type RouteTabEntry,
  type TabSection
} from "../app/routing/route-registry.js";
