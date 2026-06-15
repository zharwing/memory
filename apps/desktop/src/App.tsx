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
  InboxScreen,
  ProjectsScreen,
  SearchScreen,
  SessionsScreen,
  SettingsScreen
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
        <Route path="/projects" element={<ProjectsScreen />} />
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/current-work" element={<CurrentWorkScreen />} />
        <Route path="/sessions" element={<SessionsScreen />} />
        <Route path="/docs" element={<DocsScreen />} />
        <Route path="/diagrams" element={<DiagramsScreen />} />
        <Route path="/graph" element={<GraphScreen />} />
        <Route path="/search" element={<SearchScreen />} />
        <Route path="/inbox" element={<InboxScreen />} />
        <Route path="/context" element={<ContextScreen />} />
        <Route path="/assistant" element={<AssistantScreen />} />
        <Route path="/backups" element={<BackupsScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Routes>
    </Shell>
  );
});
