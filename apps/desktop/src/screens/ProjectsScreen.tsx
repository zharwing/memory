import { observer } from "mobx-react-lite";
import { NavLink, useNavigate } from "react-router-dom";
import { useStore } from "../stores/store-context.js";
import { Empty, Screen } from "../components/layout.js";
import { ConfirmDeleteButton } from "../components/ConfirmDeleteButton.js";

export const ProjectsScreen = observer(function ProjectsScreen() {
  const store = useStore();
  const navigate = useNavigate();

  async function openProject(projectId: string) {
    await store.selectProject(projectId);
    if (!store.error) navigate("/dashboard");
  }

  return (
    <Screen
      title="Projects"
      actions={(
        <div className="button-row">
          <NavLink className="button-link primary" to="/setup">Create Project</NavLink>
          <button onClick={() => store.loadProjects()}>Refresh</button>
        </div>
      )}
    >
      <div className="project-grid">
        {store.projects.map((project) => (
          <div className="managed-card" key={project.id}>
            <button className={`project-card ${store.selectedProjectId === project.id ? "selected" : ""}`} onClick={() => void openProject(project.id)}>
              <strong>{project.name}</strong>
              <span>{project.id}</span>
              <small>{project.memoryRoot}</small>
            </button>
            <ConfirmDeleteButton
              itemType="project"
              title={project.name}
              critical
              label="Move to Trash"
              onConfirm={() => store.deleteProject(project.id)}
            />
          </div>
        ))}
      </div>
      {store.projects.length === 0 ? <Empty text="No projects registered yet. Use Setup to create one." /> : null}
    </Screen>
  );
});
