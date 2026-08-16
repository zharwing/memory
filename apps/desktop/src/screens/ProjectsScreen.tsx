import { observer } from "mobx-react-lite";
import { NavLink, useNavigate } from "react-router-dom";
import { ResourceRecovery } from "../app/recovery/index.js";
import { useStore } from "../stores/store-context.js";
import { Empty, Screen } from "../components/layout.js";
import { ConfirmDeleteButton } from "../components/ConfirmDeleteButton.js";
import { routePath } from "../utils/routes.js";

export const ProjectsScreen = observer(function ProjectsScreen() {
  const store = useStore();
  const navigate = useNavigate();
  const projectsState = store.projects.projectsState;

  function openProject(projectId: string) {
    // Navigation is the project-selection intent. App/RootStore owns accepting
    // the matching generation, so the clicked card never flashes selected on
    // the old route before the new route is ready.
    navigate(routePath("dashboard", { projectId }));
  }

  return (
    <Screen
      title="Projects"
      actions={(
        <div className="button-row">
          <NavLink className="button-link primary" to={routePath("setup")}>Create Project</NavLink>
          <button onClick={() => store.projects.load()}>Refresh</button>
        </div>
      )}
    >
      <ResourceRecovery
        state={projectsState}
        loadingLabel="Loading projects…"
        empty={<Empty text="No projects registered yet. Use Setup to create one." />}
        onRetry={() => store.projects.load(store.projects.selectedProjectId || undefined)}
      >
        {(projects) => (
          <div className="project-grid">
            {projects.map((project) => (
              <div className="managed-card" key={project.id}>
                <button
                  className={`project-card ${store.projects.selectedProjectId === project.id ? "selected" : ""}`}
                  onClick={() => openProject(project.id)}
                >
                  <strong>{project.name}</strong>
                  <span>{project.id}</span>
                  <small>{project.memoryRoot}</small>
                </button>
                <ConfirmDeleteButton
                  itemType="project"
                  title={project.name}
                  critical
                  label="Move to Trash"
                  onConfirm={() => store.projects.deleteProject(project.id)}
                />
              </div>
            ))}
          </div>
        )}
      </ResourceRecovery>
    </Screen>
  );
});
