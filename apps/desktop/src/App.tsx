import { lazy, Suspense, type ComponentType, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { Shell } from "./components/Shell.js";
import { useStore } from "./stores/store-context.js";
import { projectIdFromPathname } from "./utils/routes.js";
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

export const App = observer(function App() {
  const store = useStore();
  const location = useLocation();
  const routeProjectId = projectIdFromPathname(location.pathname);

  useEffect(() => {
    void store.projects.load(routeProjectId).then(() => store.refreshAll());
  }, [store]);

  useEffect(() => {
    if (!routeProjectId || routeProjectId === store.projects.selectedProjectId) return;
    if (!store.projects.list.some((project) => project.id === routeProjectId)) return;
    void store.projects.selectProject(routeProjectId);
  }, [routeProjectId, store, store.projects.list.length, store.projects.selectedProjectId]);

  return (
    <Shell>
      <Suspense fallback={<div className="route-loading" role="status">Loading…</div>}>
        <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/setup" element={<SetupScreen />} />
        <Route path="/projects" element={<ProjectsScreen />} />
        <Route path="/repositories" element={<RepositoriesScreen />} />
        <Route path="/work" element={<Navigate to="/current-work" replace />} />
        <Route path="/workstreams" element={<WorkstreamsScreen />} />
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/current-work" element={<CurrentWorkScreen />} />
        <Route path="/sessions" element={<SessionsScreen />} />
        <Route path="/library" element={<Navigate to="/docs" replace />} />
        <Route path="/docs" element={<DocsScreen />} />
        <Route path="/import" element={<ImportScreen />} />
        <Route path="/diagrams" element={<DiagramsScreen />} />
        <Route path="/graph" element={<GraphScreen />} />
        <Route path="/search" element={<SearchScreen />} />
        <Route path="/inbox" element={<InboxScreen />} />
        <Route path="/context" element={<ContextScreen />} />
        <Route path="/assistant" element={<AssistantScreen />} />
        <Route path="/backups" element={<BackupsScreen />} />
        <Route path="/trash" element={<TrashScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/p/:projectId/dashboard" element={<DashboardScreen />} />
        <Route path="/p/:projectId/repositories" element={<RepositoriesScreen />} />
        <Route path="/p/:projectId/work" element={<Navigate to="current-work" replace />} />
        <Route path="/p/:projectId/work/current-work" element={<CurrentWorkScreen />} />
        <Route path="/p/:projectId/work/sessions" element={<SessionsScreen />} />
        <Route path="/p/:projectId/work/workstreams" element={<WorkstreamsScreen />} />
        <Route path="/p/:projectId/library" element={<Navigate to="docs" replace />} />
        <Route path="/p/:projectId/library/docs" element={<DocsScreen />} />
        <Route path="/p/:projectId/library/diagrams" element={<DiagramsScreen />} />
        <Route path="/p/:projectId/library/inbox" element={<InboxScreen />} />
        <Route path="/p/:projectId/library/graph" element={<GraphScreen />} />
        <Route path="/p/:projectId/library/context" element={<ContextScreen />} />
        <Route path="/p/:projectId/import" element={<ImportScreen />} />
        <Route path="/p/:projectId/search" element={<SearchScreen />} />
        <Route path="/p/:projectId/settings" element={<Navigate to="project" replace />} />
        <Route path="/p/:projectId/settings/project" element={<SettingsScreen />} />
        <Route path="/p/:projectId/settings/assistant" element={<AssistantScreen />} />
        <Route path="/p/:projectId/settings/backups" element={<BackupsScreen />} />
        <Route path="/p/:projectId/trash" element={<TrashScreen />} />
        </Routes>
      </Suspense>
    </Shell>
  );
});

function lazyScreen<T extends Record<K, ComponentType>, K extends keyof T>(
  loader: () => Promise<T>,
  exportName: K
) {
  return lazy(async () => {
    const module = await loader();
    return { default: module[exportName] };
  });
}
