import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/store-context.js";
import { KeyValue, Panel, Screen } from "../components/layout.js";
import { SettingsTabs } from "../components/SectionTabs.js";
import { DirectoryField } from "../components/DirectoryField.js";
import { ToggleGroup } from "../components/ToggleGroup.js";
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
    if (!store.system.daemonHealth) void store.system.loadDaemonHealth();
  }, [store]);

  const preview = store.projects.projectCreationPreview;
  const memoryRoot = store.system.daemonHealth?.memoryRoot || "not connected";
  const mcpInstall = store.system.mcpInstallResult as {
    changed?: boolean;
    client?: string;
    scope?: string;
    transport?: string;
    configPath?: string;
    backupPath?: string;
    installs?: Array<{
      changed?: boolean;
      client?: string;
      scope?: string;
      transport?: string;
      configPath?: string;
      warnings?: string[];
    }>;
    skipped?: Array<{ client?: string; scope?: string; reason?: string }>;
    warnings?: string[];
  } | undefined;
  const mcpDoctor = store.system.mcpDoctor as {
    daemon?: { reachable?: boolean; url?: string };
    stdio?: { toolCount?: number };
  } | undefined;
  const mcpWarnings = Array.isArray(mcpInstall?.warnings) ? mcpInstall.warnings : [];
  const mcpAutoInstalls = Array.isArray(mcpInstall?.installs) ? mcpInstall.installs : [];
  const mcpSkipped = Array.isArray(mcpInstall?.skipped) ? mcpInstall.skipped : [];
  return (
    <Screen title="Setup" actions={<button onClick={() => store.system.loadDaemonHealth()}>Check Daemon</button>}>
      <SettingsTabs />
      <div className="dashboard-grid">
        <Panel title="Daemon">
          <KeyValue label="Status" value={store.system.daemonHealth?.status || "unknown"} />
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
        <Panel title="Agent MCP">
          <div className="stacked-form">
            <p className="panel-help">
              Install Zharwing Memory as a local MCP server for coding agents. Restart the agent after installation.
            </p>
            <div className="button-row">
              <button type="button" onClick={() => store.system.installMcpClient("auto")}>Install Auto</button>
              <button type="button" onClick={() => store.system.installMcpClient("codex")}>Install Codex</button>
              <button type="button" onClick={() => store.system.installMcpClient("claude-code")}>Install Claude Code</button>
              <button type="button" onClick={() => store.system.installMcpClient("claude-desktop")}>Install Claude Desktop</button>
              <button type="button" onClick={() => store.system.loadMcpDoctor()}>Check MCP</button>
            </div>
            {mcpInstall ? (
              <div className="setup-guidance">
                <strong>{mcpInstall.client === "auto" ? "Auto install complete" : mcpInstall.changed ? "Installed" : "Already configured"}</strong>
                {mcpAutoInstalls.length ? (
                  <ul>
                    {mcpAutoInstalls.map((install) => (
                      <li key={`${install.scope}-${install.client}-${install.configPath}`}>
                        {install.client} ({install.scope}) uses {install.transport} at {install.configPath}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{mcpInstall.client} ({mcpInstall.scope || "current-os"}) uses {mcpInstall.transport} at {mcpInstall.configPath}.</p>
                )}
                {mcpInstall.backupPath ? <p>Backup: {mcpInstall.backupPath}</p> : null}
                {mcpWarnings.length ? (
                  <ul>
                    {mcpWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                ) : null}
                {mcpSkipped.length ? (
                  <ul>
                    {mcpSkipped.map((skipped) => (
                      <li key={`${skipped.scope}-${skipped.client}-${skipped.reason}`}>{skipped.client} ({skipped.scope}) skipped: {skipped.reason}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {mcpDoctor ? (
              <div className="setup-guidance">
                <strong>Doctor</strong>
                <p>Daemon: {mcpDoctor.daemon?.reachable ? "reachable" : "not reachable"} at {mcpDoctor.daemon?.url}</p>
                <p>Stdio tools: {mcpDoctor.stdio?.toolCount || 0}</p>
              </div>
            ) : null}
          </div>
        </Panel>
        <Panel title="Create Project">
          <form className="stacked-form" onSubmit={(event) => {
            event.preventDefault();
            const shouldLinkInitialRepo = setupMode === "initial-repo" && workingDirectory.trim();
            void store.projects.prepareProjectCreation({
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
              <ToggleGroup
                className="segmented-control"
                role="group"
                ariaLabel="Setup path"
                value={setupMode}
                onChange={(nextMode) => setSetupMode(nextMode as "project-only" | "initial-repo")}
                options={[
                  { value: "project-only", label: "Project only" },
                  { value: "initial-repo", label: "Project plus one repo" }
                ]}
              />
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
                const created = await store.projects.createProjectFromPreview();
                if (created) navigate(projectPath(store.projects.selectedProjectId, "/repositories"));
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
