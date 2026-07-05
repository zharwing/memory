import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/store-context.js";
import { KeyValue, Panel, Screen } from "../components/layout.js";
import { SettingsTabs } from "../components/SectionTabs.js";
import { DirectoryField } from "../components/DirectoryField.js";
import { splitList } from "../utils/format.js";
import { projectPath } from "../utils/routes.js";

export const SetupScreen = observer(function SetupScreen() {
  const store = useStore();
  const navigate = useNavigate();
  const [setupMode, setSetupMode] = useState<"project-only" | "initial-repo">("project-only");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [projectName, setProjectName] = useState("");
  const [createPointerFile, setCreatePointerFile] = useState(true);
  const [bootstrapFiles, setBootstrapFiles] = useState("AGENTS.md");

  useEffect(() => {
    if (!store.daemonHealth) void store.loadDaemonHealth();
  }, [store]);

  const preview = store.projectCreationPreview;
  const memoryRoot = store.daemonHealth?.memoryRoot || "not connected";
  return (
    <Screen title="Setup" actions={<button onClick={() => store.loadDaemonHealth()}>Check Daemon</button>}>
      <SettingsTabs />
      <div className="dashboard-grid">
        <Panel title="Daemon">
          <KeyValue label="Status" value={store.daemonHealth?.status || "unknown"} />
          <KeyValue label="Private store" value={memoryRoot} />
          <p className="panel-help">
            The private store is local data, not app source code. It holds your projects, sessions,
            docs, imports, context bundles, inbox proposals, and backups.
          </p>
        </Panel>
        <Panel title="First Run">
          <ol className="setup-steps">
            <li>Create one memory project for a product, program, or client.</li>
            <li>Link one or more Git repo folders from Repositories.</li>
            <li>Create broad workstreams for multi-day topics.</li>
            <li>Preview imports before committing old notes or sessions.</li>
          </ol>
        </Panel>
        <Panel title="Create Project">
          <form className="stacked-form" onSubmit={(event) => {
            event.preventDefault();
            const shouldLinkInitialRepo = setupMode === "initial-repo" && workingDirectory.trim();
            void store.prepareProjectCreation({
              workingDirectory: shouldLinkInitialRepo ? workingDirectory : undefined,
              projectName,
              createPointerFile: shouldLinkInitialRepo ? createPointerFile : false,
              bootstrapFiles: shouldLinkInitialRepo ? splitList(bootstrapFiles) : []
            });
          }}>
            <label>
              <span>Project name</span>
              <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="My Product" required />
            </label>
            <div className="setup-guidance">
              <strong>Project means the memory container</strong>
              <p>
                A project can cover one repo, a monorepo, or many separate service and frontend repos.
                Repo folders are linked after the project exists.
              </p>
            </div>
            <div>
              <span className="field-label">Setup path</span>
              <div className="segmented-control" role="group" aria-label="Setup path">
                <button
                  type="button"
                  className={setupMode === "project-only" ? "selected" : ""}
                  onClick={() => setSetupMode("project-only")}
                >
                  Project only
                </button>
                <button
                  type="button"
                  className={setupMode === "initial-repo" ? "selected" : ""}
                  onClick={() => setSetupMode("initial-repo")}
                >
                  Project plus one repo
                </button>
              </div>
              <p className="field-help">
                Choose project only for multi-repo products. Choose project plus one repo only as a shortcut for simple single-repo setup.
              </p>
            </div>
            {setupMode === "initial-repo" ? (
              <div className="setup-optional-section">
                <label>
                  <span>First repo folder</span>
                  <DirectoryField value={workingDirectory} onChange={setWorkingDirectory} placeholder="<absolute-path-to-repo-root>" />
                </label>
                <p className="field-help">
                  Pick the Git repo root. For a monorepo, link the monorepo root, not each package folder.
                </p>
                <label>
                  <span>Bootstrap files</span>
                  <input value={bootstrapFiles} onChange={(event) => setBootstrapFiles(event.target.value)} placeholder="AGENTS.md,CLAUDE.md" />
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={createPointerFile} onChange={(event) => setCreatePointerFile(event.target.checked)} />
                  <span>Write pointer file into this repo</span>
                </label>
                <p className="field-help">
                  Pointer files let agents auto-detect this memory project from the repo folder.
                </p>
              </div>
            ) : null}
            <button type="submit">Preview Project</button>
          </form>
        </Panel>
      </div>
      {preview ? (
        <Panel title="Project Preview">
          <KeyValue label="Project ID" value={preview.proposedProjectId} />
          <KeyValue label="Name" value={preview.proposedProjectName} />
          <KeyValue label="Initial repo" value={preview.repoRoot || "none"} />
          <KeyValue label="Memory location" value={preview.memoryLocation} />
          <KeyValue label="Pointer file" value={preview.pointerFilePath || "disabled"} />
          <div className="button-row">
            <button
              type="button"
              onClick={async () => {
                const created = await store.createProjectFromPreview();
                if (created) navigate(projectPath(store.selectedProjectId, "/repositories"));
              }}
            >
              Create Project and Add Repos
            </button>
          </div>
        </Panel>
      ) : null}
    </Screen>
  );
});
