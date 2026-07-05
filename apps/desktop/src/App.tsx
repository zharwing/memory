import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { Shell } from "./components/Shell.js";
import { useStore } from "./stores/store-context.js";
import { projectIdFromPathname } from "./utils/routes.js";
import {
  AssistantScreen,
  BackupsScreen,
  ContextScreen,
  CurrentWorkScreen,
  DashboardScreen,
  DiagramsScreen,
  DocsScreen,
  GraphScreen,
  ImportScreen,
  InboxScreen,
  ProjectsScreen,
  RepositoriesScreen,
  SearchScreen,
  SessionsScreen,
  SetupScreen,
  SettingsScreen,
  TrashScreen,
  WorkstreamsScreen
} from "./screens/index.js";

export const App = observer(function App() {
  const store = useStore();
  const location = useLocation();
  const routeProjectId = projectIdFromPathname(location.pathname);

  useEffect(() => {
    void store.loadProjects(routeProjectId).then(() => store.refreshProject());
  }, [store]);

  useEffect(() => {
    if (!routeProjectId || routeProjectId === store.selectedProjectId) return;
    if (!store.projects.some((project) => project.id === routeProjectId)) return;
    void store.selectProject(routeProjectId);
  }, [routeProjectId, store, store.projects.length, store.selectedProjectId]);

  return (
    <Shell>
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
    </Shell>
  );
});
