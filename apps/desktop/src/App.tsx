import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { Shell } from "./components/Shell.js";
import { useStore } from "./stores/store-context.js";
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
} from "./routes/screens.js";

export const App = observer(function App() {
  const store = useStore();

  useEffect(() => {
    void store.loadProjects().then(() => store.refreshProject());
  }, [store]);

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
      </Routes>
    </Shell>
  );
});
