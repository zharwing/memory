import { lazy, type ComponentType, type ReactNode, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useLocation } from "react-router-dom";
import { Shell } from "./components/Shell.js";
import {
  RecoveryPanel,
  RouteRecoveryBoundary
} from "./app/recovery/index.js";
import {
  MalformedRouteScreen,
  MissingProjectRouteScreen,
  RegisteredRouteOutlet,
  type RegisteredScreens
} from "./app/routing/route-elements.js";
import { decodeRouteLocation } from "./app/routing/route-registry.js";
import { useStore } from "./stores/store-context.js";

const AssistantScreen = lazyScreen(() => import("./screens/AssistantScreen.js"), "AssistantScreen");
const BackupsScreen = lazyScreen(() => import("./screens/BackupsScreen.js"), "BackupsScreen");
const ContextScreen = lazyScreen(() => import("./screens/ContextScreen.js"), "ContextScreen");
const CurrentWorkScreen = lazyScreen(() => import("./screens/CurrentWorkScreen.js"), "CurrentWorkScreen");
const DashboardScreen = lazyScreen(() => import("./screens/DashboardScreen.js"), "DashboardScreen");
const DiagramsScreen = lazyScreen(() => import("./screens/DiagramsScreen.js"), "DiagramsScreen");
const DocsScreen = lazyScreen(() => import("./screens/DocsScreen.js"), "DocsScreen");
const GraphScreen = lazyScreen(() => import("./screens/graph/GraphScreen.js"), "GraphScreen");
const ImportScreen = lazyScreen(() => import("./screens/ImportScreen.js"), "ImportScreen");
const InboxScreen = lazyScreen(() => import("./screens/InboxScreen.js"), "InboxScreen");
const ProjectsScreen = lazyScreen(() => import("./screens/ProjectsScreen.js"), "ProjectsScreen");
const RepositoriesScreen = lazyScreen(() => import("./screens/RepositoriesScreen.js"), "RepositoriesScreen");
const SearchScreen = lazyScreen(() => import("./screens/SearchScreen.js"), "SearchScreen");
const SessionsScreen = lazyScreen(() => import("./screens/SessionsScreen.js"), "SessionsScreen");
const SetupScreen = lazyScreen(() => import("./screens/SetupScreen.js"), "SetupScreen");
const SettingsScreen = lazyScreen(() => import("./screens/SettingsScreen.js"), "SettingsScreen");
const TrashScreen = lazyScreen(() => import("./screens/TrashScreen.js"), "TrashScreen");
const WorkstreamsScreen = lazyScreen(() => import("./screens/WorkstreamsScreen.js"), "WorkstreamsScreen");

const REGISTERED_SCREENS = {
  assistant: AssistantScreen,
  backups: BackupsScreen,
  context: ContextScreen,
  currentWork: CurrentWorkScreen,
  dashboard: DashboardScreen,
  diagrams: DiagramsScreen,
  docs: DocsScreen,
  graph: GraphScreen,
  import: ImportScreen,
  inbox: InboxScreen,
  projects: ProjectsScreen,
  repositories: RepositoriesScreen,
  search: SearchScreen,
  sessions: SessionsScreen,
  setup: SetupScreen,
  settings: SettingsScreen,
  trash: TrashScreen,
  workstreams: WorkstreamsScreen
} satisfies RegisteredScreens;

export const App = observer(function App() {
  const store = useStore();
  const location = useLocation();
  const decodedRoute = decodeRouteLocation(location.pathname);
  const routeProjectId = decodedRoute.status === "matched" ? decodedRoute.projectId : undefined;

  useEffect(() => {
    // initialize() also owns subsequent URL-driven project activation. Its
    // project scope generation prevents an older back/forward transition from
    // committing after a newer one.
    if (decodedRoute.status !== "malformed") void store.initialize(routeProjectId);
  }, [decodedRoute.status, store, routeProjectId]);

  useEffect(() => {
    const updateForeground = () => {
      store.setForeground(document.visibilityState !== "hidden" && document.hasFocus());
    };
    const markBackground = () => store.setForeground(false);
    updateForeground();
    window.addEventListener("focus", updateForeground);
    window.addEventListener("blur", markBackground);
    document.addEventListener("visibilitychange", updateForeground);
    return () => {
      window.removeEventListener("focus", updateForeground);
      window.removeEventListener("blur", markBackground);
      document.removeEventListener("visibilitychange", updateForeground);
    };
  }, [store]);

  const projectListSettled =
    store.projects.projectsState.status === "success" ||
    store.projects.projectsState.status === "empty";
  const routeProjectExists = routeProjectId
    ? store.projects.list.some((project) => project.id === routeProjectId)
    : true;
  const routeScopeAccepted =
    !routeProjectId || routeProjectId === store.projectScope.currentProjectId();

  if (decodedRoute.status === "malformed") {
    return <Shell><MalformedRouteScreen /></Shell>;
  }

  if (decodedRoute.status === "not_found") {
    return (
      <Shell>
        <RouteRecoveryBoundary resetKey={location.key} onReset={() => store.recover()}>
          <RegisteredRouteOutlet screens={REGISTERED_SCREENS} />
        </RouteRecoveryBoundary>
      </Shell>
    );
  }

  const projectState = store.projects.projectsState;
  if ((projectState.status === "idle" || projectState.status === "loading") && store.projects.list.length === 0) {
    return <div className="route-loading" role="status" aria-live="polite">Loading projects...</div>;
  }
  if (projectState.status === "failure" && !projectState.previous) {
    const recovery = store.recoveryState;
    if (recovery.status === "locked") {
      return (
        <StartupRecoverySurface>
          <RecoveryPanel
            surface="session"
            error={recovery.error}
            title="Local session needs a refresh"
            detail="Reload the app to reconnect to the local service."
          />
        </StartupRecoverySurface>
      );
    }
    if (recovery.status === "offline") {
      return (
        <StartupRecoverySurface>
          <RecoveryPanel
            surface="resource"
            error={recovery.error}
            title="Local service unavailable"
            detail="No current project observation is available. Start the local service and try again."
            onRecover={() => store.recover()}
          />
        </StartupRecoverySurface>
      );
    }
    return (
      <StartupRecoverySurface>
        <RecoveryPanel
          surface="resource"
          error={projectState.error}
          title="Projects could not be loaded"
          onRecover={() => store.projects.load(routeProjectId)}
        />
      </StartupRecoverySurface>
    );
  }

  if (routeProjectId && projectListSettled && !routeProjectExists) {
    return <Shell><MissingProjectRouteScreen /></Shell>;
  }

  // The shell itself reads project names, counts, links, and status. Do not
  // mount a project screen until its exact URL scope generation is accepted.
  if (!routeScopeAccepted) {
    return (
      <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
        Switching project...
      </div>
    );
  }

  return (
    <Shell>
      <RouteRecoveryBoundary
        resetKey={`${location.key}:${routeProjectId ?? "application"}`}
        onReset={() => store.recover()}
      >
        <RegisteredRouteOutlet screens={REGISTERED_SCREENS} />
      </RouteRecoveryBoundary>
    </Shell>
  );
});

function StartupRecoverySurface({ children }: { children: ReactNode }) {
  return (
    <main className="route-screen-frame startup-recovery">
      <h1>Zharwing Memory</h1>
      {children}
    </main>
  );
}

function lazyScreen<T extends Record<K, ComponentType>, K extends keyof T>(
  loader: () => Promise<T>,
  exportName: K
) {
  return lazy(async () => {
    const module = await loader();
    return { default: module[exportName] };
  });
}
