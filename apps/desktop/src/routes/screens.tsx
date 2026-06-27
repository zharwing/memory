import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { NavLink, useNavigate } from "react-router-dom";
import { Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge, type Node, Position } from "@xyflow/react";
import { CircleHelp, Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useStore } from "../stores/store-context.js";
import { canPickDirectory, pickDirectory } from "../utils/folder-picker.js";

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
                  <DirectoryField value={workingDirectory} onChange={setWorkingDirectory} placeholder="D:\\path\\to\\repo-root" />
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
                if (created) navigate("/repositories");
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

export const RepositoriesScreen = observer(function RepositoriesScreen() {
  const store = useStore();
  const [repoPath, setRepoPath] = useState("");
  const [repoName, setRepoName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [writePointerFile, setWritePointerFile] = useState(true);

  useEffect(() => {
    if (store.selectedProjectId) void store.loadRepoLinks();
  }, [store, store.selectedProjectId]);

  const projectName = store.selectedProject?.name || "this project";
  const hasLinkedRepos = store.repoLinks.length > 0;

  return (
    <Screen title="Repositories" actions={<button disabled={!store.selectedProjectId} onClick={() => store.loadRepoLinks()}>Refresh</button>}>
      {store.selectedProjectId && !hasLinkedRepos ? (
        <Panel title="Next: Add Repositories">
          <ol className="setup-steps">
            <li>Add every code repo that belongs to {projectName}.</li>
            <li>Use the Git repo root folder, not the memory store and not old docs folders.</li>
            <li>Keep pointer files enabled so agents can detect this memory project from each repo.</li>
            <li>After repos are linked, open Import to bring in old memory and sessions.</li>
          </ol>
          <div className="path-examples">
            <code>D:\path\to\frontend-repo</code>
            <code>D:\path\to\service-repo</code>
            <code>D:\path\to\worker-repo</code>
          </div>
        </Panel>
      ) : null}
      <Panel title="How Repo Links Work">
        <div className="setup-guidance">
          <strong>Link Git repo roots, not memory folders</strong>
          <p>
            Add every code repo that belongs to this memory project. A monorepo should be linked once at its repo root.
            Separate microservice or frontend repos should be linked one by one.
          </p>
        </div>
      </Panel>
      <Panel title="Link Repo">
        <form className="stacked-form" onSubmit={(event) => {
          event.preventDefault();
          void store.linkRepo({
            repoPath,
            role: role || "other",
            name: repoName,
            description,
            defaultBranch,
            writePointerFile
          }).then(() => {
            setRepoPath("");
            setRepoName("");
            setRole("");
            setDescription("");
            setDefaultBranch("");
          });
        }}>
          <label>
            <span>Repo path</span>
            <DirectoryField value={repoPath} onChange={setRepoPath} placeholder="D:\\path\\to\\repo-root" required />
          </label>
          <p className="field-help">
            Use the folder that contains the repo's `.git` directory, or any folder inside that repo.
            AI Memory will resolve it to the repo root.
          </p>
          <label>
            <span>Name</span>
            <input value={repoName} onChange={(event) => setRepoName(event.target.value)} placeholder="Product web runtime" />
          </label>
          <label>
            <span>Category</span>
            <input value={role} onChange={(event) => setRole(event.target.value)} placeholder="service, app, docs, worker, wrapper" />
          </label>
          <label>
            <span>Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this repository owns" rows={3} />
          </label>
          <label>
            <span>Default branch</span>
            <input value={defaultBranch} onChange={(event) => setDefaultBranch(event.target.value)} placeholder="main" />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={writePointerFile} onChange={(event) => setWritePointerFile(event.target.checked)} />
            <span>Write pointer file</span>
          </label>
          <p className="field-help">
            Pointer files are small `.ai-memory.json` files in linked repos. They help agents auto-detect this project from the repo.
          </p>
          <button type="submit" disabled={!store.selectedProjectId}>Link Repo</button>
        </form>
      </Panel>
      {store.selectedProjectId && hasLinkedRepos ? (
        <Panel title="Next: Import Existing Memory">
          <p className="panel-help">
            Repos are linked. Open Import next, preview old MEMORY folders as Memory Docs,
            then preview old SESSIONS folders as Session History before committing them.
          </p>
        </Panel>
      ) : null}
      <Panel title="Linked Repos">
        {store.repoLinks.length ? (
          <div className="repo-list">
            {store.repoLinks.map((repo) => (
              <div className="repo-row" key={repo.path}>
                <div>
                  <strong>{repo.name || repo.path.split(/[\\/]/).pop() || repo.role}</strong>
                  <span>{repo.path}</span>
                  <small>{[repo.role, repo.defaultBranch || "branch unknown"].filter(Boolean).join(" / ")}</small>
                  {repo.description ? <p>{repo.description}</p> : null}
                </div>
                <ConfirmDeleteButton
                  itemType="repo"
                  title={repo.name || repo.path}
                  label="Move to Trash"
                  onConfirm={() => store.deleteRepo(repo.path, true)}
                />
              </div>
            ))}
          </div>
        ) : (
          <Empty text="No repos linked to this project." />
        )}
      </Panel>
    </Screen>
  );
});

export const WorkstreamsScreen = observer(function WorkstreamsScreen() {
  const store = useStore();
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [goal, setGoal] = useState("");
  const [topics, setTopics] = useState("");
  const [repoRoles, setRepoRoles] = useState("");
  const [relatedTasks, setRelatedTasks] = useState("");
  const [relatedFiles, setRelatedFiles] = useState("");

  useEffect(() => {
    if (store.selectedProjectId) void store.loadWorkstreams();
  }, [store, store.selectedProjectId]);

  const detail = store.workstreamDetail;
  const repoCategoryOptions = [...new Set(store.repoLinks.map((repo) => repo.role).filter(Boolean))].sort();
  const selectedRepoCategories = splitList(repoRoles);
  function toggleRepoCategory(category: string) {
    const next = selectedRepoCategories.includes(category)
      ? selectedRepoCategories.filter((item) => item !== category)
      : [...selectedRepoCategories, category];
    setRepoRoles(next.join(", "));
  }

  return (
    <Screen title="Workstreams" actions={<button disabled={!store.selectedProjectId} onClick={() => store.loadWorkstreams()}>Refresh</button>}>
      <WorkTabs />
      <div className="dashboard-grid">
        <Panel title="Create Workstream">
          <form className="stacked-form" onSubmit={(event) => {
            event.preventDefault();
            void store.createWorkstream({
              name,
              summary,
              goal,
              topics: splitList(topics),
              repoRoles: splitList(repoRoles),
              relatedTasks: splitList(relatedTasks),
              relatedFiles: splitList(relatedFiles)
            }).then(() => {
              setName("");
              setSummary("");
              setGoal("");
              setTopics("");
              setRepoRoles("");
              setRelatedTasks("");
              setRelatedFiles("");
            });
          }}>
            <label>
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Dashboard testing" required />
            </label>
            <label>
              <span>Description</span>
              <textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What kind of work belongs here?" rows={3} />
            </label>
            <details className="advanced-fields">
              <summary>Advanced details</summary>
              <div className="advanced-fields-body">
                <label>
                  <span>Target outcome</span>
                  <textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="What this workstream is trying to finish" rows={3} />
                </label>
                <label>
                  <span>Tags</span>
                  <input value={topics} onChange={(event) => setTopics(event.target.value)} placeholder="dashboard, testing, memory" />
                  <p className="field-help">Optional. The workstream name is already used as a tag.</p>
                </label>
                <label>
                  <span>Repo categories</span>
                  {repoCategoryOptions.length ? (
                    <div className="option-chips" aria-label="Repo categories">
                      {repoCategoryOptions.map((category) => (
                        <button
                          type="button"
                          key={category}
                          className={selectedRepoCategories.includes(category) ? "selected" : ""}
                          onClick={() => toggleRepoCategory(category)}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <input value={repoRoles} onChange={(event) => setRepoRoles(event.target.value)} placeholder={repoCategoryOptions.length ? "additional categories" : "app, backend"} />
                  <p className="field-help">Optional. Select known repo categories or type extras separated by commas.</p>
                </label>
                <label>
                  <span>Related tasks</span>
                  <input value={relatedTasks} onChange={(event) => setRelatedTasks(event.target.value)} placeholder="task ids or labels" />
                </label>
                <label>
                  <span>Related files</span>
                  <input value={relatedFiles} onChange={(event) => setRelatedFiles(event.target.value)} placeholder="paths this workstream often touches" />
                </label>
              </div>
            </details>
            <button type="submit" disabled={!store.selectedProjectId}>Create Workstream</button>
          </form>
        </Panel>
        <Panel title="Workstream List">
          {store.workstreams.length ? (
            <div className="repo-list">
              {store.workstreams.map((workstream) => (
                <button
                  type="button"
                  className={`project-card compact ${store.selectedWorkstreamId === workstream.id ? "selected" : ""}`}
                  key={workstream.id}
                  onClick={() => store.selectWorkstream(workstream.id)}
                >
                  <strong>{workstream.name}</strong>
                  <span>{workstream.status}</span>
                  <small>{workstream.topics?.join(", ") || workstream.slug}</small>
                </button>
              ))}
            </div>
          ) : (
            <Empty text="No workstreams yet. Create one for a multi-day topic like Huddle." />
          )}
        </Panel>
      </div>

      {detail ? (
        <Panel title={detail.workstream.name}>
          <div className="dashboard-grid tight">
            <KeyValue label="Status" value={detail.workstream.status} />
            <KeyValue label="Topics" value={detail.workstream.topics?.join(", ") || "none"} />
            <KeyValue label="Sessions" value={detail.sessions?.length || 0} />
            <KeyValue label="Documents" value={detail.documents?.length || 0} />
            <KeyValue label="Updated" value={detail.workstream.updated} />
            <KeyValue label="File" value={detail.workstream.filePath || "not written"} />
          </div>
          <div className="button-row">
            {["active", "paused", "done", "archived"].map((status) => (
              <button
                type="button"
                key={status}
                disabled={detail.workstream.status === status}
                onClick={() => store.updateWorkstreamStatus(detail.workstream.id, status)}
              >
                {status}
              </button>
            ))}
            <ConfirmDeleteButton
              itemType="workstream"
              title={detail.workstream.name}
              label="Move to Trash"
              onConfirm={() => store.deleteWorkstream(detail.workstream.id)}
            />
          </div>
          <pre className="markdown-preview">{detail.workstream.body}</pre>
          <h3>Related Sessions</h3>
          <DataTable columns={["updated", "status", "agent", "taskTitle"]} rows={detail.sessions || []} />
          <h3>Related Docs</h3>
          <DataTable columns={["updated", "status", "visibility", "type", "title"]} rows={detail.documents || []} />
        </Panel>
      ) : null}
    </Screen>
  );
});

export const DashboardScreen = observer(function DashboardScreen() {
  const store = useStore();
  const summary = store.summary;
  const memoryWritePolicy = store.selectedMemoryWritePolicy;
  return (
    <Screen title="Project Dashboard" actions={<DashboardActions />}>
      <div className="dashboard-grid">
        <Panel title="Current Work">
          <KeyValue label="Active session" value={summary?.activeSession?.taskTitle || "None"} />
          <KeyValue label="Latest session" value={summary?.latestSession?.taskTitle || "None"} />
          <KeyValue label="Pending next steps" value={summary?.latestSession?.nextSteps?.length || 0} />
        </Panel>
        <Panel title="Context Preview">
          <p className="panel-help">Preview only. These items are not sent anywhere unless an agent or user asks for a context bundle.</p>
          <KeyValue label="Safety" value={store.contextBundle?.safetyStatus || "unknown"} />
          <KeyValue label="Would include" value={store.contextBundle?.includedItems?.length || 0} />
          <KeyValue label="Would skip" value={store.contextBundle?.excludedItems?.length || 0} />
          <KeyValue label="Estimated tokens" value={store.contextBundle?.tokenEstimate || 0} />
        </Panel>
        <Panel title="Memory Updates">
          <p className="panel-help">
            Agents can write normal session logs and project memory directly. The inbox is only used when review mode is enabled or an update needs attention.
          </p>
          <KeyValue label="Review mode" value={reviewModeLabel(memoryWritePolicy.reviewMode)} />
          <KeyValue label="Direct agent writes" value={memoryWritePolicy.allowAgentDirectWrites ? "Allowed" : "Disabled"} />
          <KeyValue label="Pending review" value={store.inbox.filter((item) => item.status === "pending").length} />
        </Panel>
        <Panel title="Graph Snapshot">
          <KeyValue label="Nodes" value={store.graph?.nodes?.length || 0} />
          <KeyValue label="Edges" value={store.graph?.edges?.length || 0} />
        </Panel>
      </div>
      <RecentSessions />
    </Screen>
  );
});

export const CurrentWorkScreen = observer(function CurrentWorkScreen() {
  const store = useStore();
  const active = store.sessions.find((session) => session.status === "active");
  const [summary, setSummary] = useState("");
  const [closeSummary, setCloseSummary] = useState("");
  return (
    <Screen title="Current Work">
      <WorkTabs />
      {active ? (
        <Panel title={active.taskTitle}>
          <KeyValue label="Status" value={active.status} />
          <KeyValue label="Started" value={active.started} />
          <KeyValue label="Updated" value={active.updated} />
          <form className="inline-form" onSubmit={(event) => {
            event.preventDefault();
            void store.saveCheckpoint(active.id, summary);
            setSummary("");
          }}>
            <input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Checkpoint summary" />
            <button type="submit">Save Checkpoint</button>
          </form>
          <form className="inline-form" onSubmit={(event) => {
            event.preventDefault();
            void store.closeSession(active.id, closeSummary).then(() => setCloseSummary(""));
          }}>
            <input value={closeSummary} onChange={(event) => setCloseSummary(event.target.value)} placeholder="Closeout summary, optional" />
            <button type="submit">Close Work Log</button>
          </form>
        </Panel>
      ) : (
        <Empty text="No active session. Start or resume from the dashboard." />
      )}
    </Screen>
  );
});

export const SessionsScreen = observer(function SessionsScreen() {
  const store = useStore();
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const selectedSession = store.sessions.find((session) => session.id === selectedSessionId) || store.sessions[0];
  return (
    <Screen title="Sessions for this project">
      <WorkTabs />
      <DataTable columns={["updated", "status", "agent", "branch", "taskTitle"]} rows={store.sessions} />
      {selectedSession ? (
        <Panel title="Session Markdown">
          <div className="inline-form compact">
            <select value={selectedSession.id} onChange={(event) => setSelectedSessionId(event.target.value)}>
              {store.sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.updated} - {session.taskTitle}
                </option>
              ))}
            </select>
            <ConfirmDeleteButton
              itemType="session"
              title={selectedSession.taskTitle}
              critical={selectedSession.status === "active"}
              label="Move to Trash"
              onConfirm={() => store.deleteSession(selectedSession.id)}
            />
          </div>
          <pre className="markdown-preview">{selectedSession.body || "No session body recorded."}</pre>
        </Panel>
      ) : (
        <Empty text="No sessions recorded yet." />
      )}
    </Screen>
  );
});

export const DocsScreen = observer(function DocsScreen() {
  const store = useStore();
  const [selectedDocId, setSelectedDocId] = useState("");
  const [editingDocId, setEditingDocId] = useState("");
  const [filter, setFilter] = useState("all");
  const [showStarterDocsHelp, setShowStarterDocsHelp] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const docs = store.docs.filter((doc) => doc.type !== "diagram");
  const filteredDocs = filterDocuments(docs, filter);
  const starterDraftDocs = store.docs.filter(isStarterDraftDoc);
  const pageCount = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  const pageIndex = Math.min(page, pageCount - 1);
  const pagedDocs = filteredDocs.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const editingDoc = store.docs.find((doc) => doc.id === editingDocId);

  function chooseFilter(nextFilter: string) {
    setFilter(nextFilter);
    setShowStarterDocsHelp(false);
    setPage(0);
    setSelectedDocId("");
  }

  function openDocEditor(doc: any) {
    setSelectedDocId(doc.id);
    setEditingDocId(doc.id);
  }

  function paginationControls(position: "top" | "bottom") {
    return (
      <div className={`pagination-controls ${position === "bottom" ? "bottom-pagination" : ""}`}>
        <span>{filteredDocs.length ? `${pageIndex * pageSize + 1}-${Math.min((pageIndex + 1) * pageSize, filteredDocs.length)} of ${filteredDocs.length}` : "0 documents"}</span>
        <button type="button" disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>Previous</button>
        <button type="button" disabled={pageIndex >= pageCount - 1} onClick={() => setPage(pageIndex + 1)}>Next</button>
      </div>
    );
  }

  return (
    <Screen title="Docs Library">
      <LibraryTabs />
      {(filter === "draft" || showStarterDocsHelp) ? (
        <div className="notice docs-explainer">
          <strong>Draft starter docs</strong>
          <p>
            These default project documents are reusable memory for agents: overview, architecture,
            decisions, tasks, gotchas, commands, glossary, and privacy rules. They start as drafts
            because they are placeholders until you or an agent fills them with project-specific facts.
          </p>
          <p>
            Sessions are chronological work logs for a run. Docs are longer-lived project knowledge
            that future sessions can reuse without digging through every past log.
          </p>
        </div>
      ) : null}
      <div className="table-toolbar">
        <div className="docs-filter-row">
          <div className="option-chips" aria-label="Document filters">
            {[
              ["all", `All (${docs.length})`],
              ["imported", `Imported (${filterDocuments(docs, "imported").length})`],
              ["draft", `Draft (${filterDocuments(docs, "draft").length})`]
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "selected" : ""}
                onClick={() => chooseFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {starterDraftDocs.length > 0 && filter !== "draft" ? (
            <button
              type="button"
              className={`icon-button icon-only docs-help-trigger ${showStarterDocsHelp ? "selected" : ""}`}
              onClick={() => setShowStarterDocsHelp((open) => !open)}
              title="What are draft starter docs?"
              aria-label="What are draft starter docs?"
              aria-expanded={showStarterDocsHelp}
            >
              <CircleHelp size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {paginationControls("top")}
      </div>
      {pagedDocs.length ? (
        <>
          <DataTable
            columns={["updated", "status", "visibility", "type", "title"]}
            rows={pagedDocs}
            selectedRowId={selectedDocId}
            onRowClick={openDocEditor}
            rowActions={(doc) => (
              <button type="button" onClick={() => openDocEditor(doc)}>
                Edit
              </button>
            )}
          />
          {paginationControls("bottom")}
        </>
      ) : (
        <Empty text="No documents match this filter." />
      )}
      {editingDoc ? (
        <DocumentEditorModal
          doc={editingDoc}
          saving={store.loading}
          onClose={() => setEditingDocId("")}
          onSave={(changes) => store.updateDocument(editingDoc.id, changes)}
          onDelete={async () => {
            await store.deleteDocument(editingDoc.id);
            setEditingDocId("");
          }}
        />
      ) : null}
    </Screen>
  );
});

export const DiagramsScreen = observer(function DiagramsScreen() {
  const store = useStore();
  const [editingDocId, setEditingDocId] = useState("");
  const diagrams = store.docs.filter((doc) => doc.type === "diagram");
  const editingDoc = store.docs.find((doc) => doc.id === editingDocId);
  return (
    <Screen title="Diagrams">
      <LibraryTabs />
      <DataTable
        columns={["updated", "status", "visibility", "title", "format"]}
        rows={diagrams}
        selectedRowId={editingDocId}
        onRowClick={(doc) => setEditingDocId(doc.id)}
        rowActions={(doc) => (
          <button type="button" onClick={() => setEditingDocId(doc.id)}>
            Edit
          </button>
        )}
      />
      {diagrams.length === 0 ? <Empty text="No diagrams yet. Mermaid diagram documents will appear here." /> : null}
      {editingDoc ? (
        <DocumentEditorModal
          doc={editingDoc}
          saving={store.loading}
          onClose={() => setEditingDocId("")}
          onSave={(changes) => store.updateDocument(editingDoc.id, changes)}
          onDelete={async () => {
            await store.deleteDocument(editingDoc.id);
            setEditingDocId("");
          }}
        />
      ) : null}
    </Screen>
  );
});

export const GraphScreen = observer(function GraphScreen() {
  const store = useStore();
  const graph = useMemo(() => enhanceGraphForDisplay(store.graph, store.docs), [store.graph, store.docs]);
  const [graphViewMode, setGraphViewMode] = useState<GraphViewMode>("context");
  const [focusedNodeId, setFocusedNodeId] = useState("");
  const [focusHistory, setFocusHistory] = useState<string[]>([]);
  const [editingDocId, setEditingDocId] = useState("");
  const graphStats = useMemo(() => getGraphStats(graph), [graph]);
  const focusOptions = useMemo(() => getGraphFocusOptions(graph), [graph]);
  const graphElements = useMemo(() => buildGraphFlowElements(graph, graphViewMode, focusedNodeId), [graph, graphViewMode, focusedNodeId]);
  const isRawGraph = graphViewMode === "all";
  const editingDoc = store.docs.find((doc) => doc.id === editingDocId);
  const graphFlowKey = `${graphViewMode}:${focusedNodeId || "overview"}:${graphElements.nodes.length}:${graphElements.edges.length}`;

  useEffect(() => {
    if (focusedNodeId && !focusOptions.some((option) => option.id === focusedNodeId)) {
      setFocusedNodeId("");
      setFocusHistory([]);
    }
  }, [focusedNodeId, focusOptions]);

  useEffect(() => {
    if (editingDocId && !store.docs.some((doc) => doc.id === editingDocId)) {
      setEditingDocId("");
    }
  }, [editingDocId, store.docs]);

  function resetGraphFocus() {
    setFocusedNodeId("");
    setFocusHistory([]);
  }

  function setGraphFocusFromControl(nextNodeId: string) {
    setGraphViewMode("context");
    setFocusedNodeId(nextNodeId);
    setFocusHistory([]);
  }

  function navigateGraphFocus(nextNodeId: string) {
    if (!nextNodeId) {
      resetGraphFocus();
      return;
    }

    setGraphViewMode("context");
    if (nextNodeId === focusedNodeId) {
      const previousNodeId = focusHistory[focusHistory.length - 1] || "";
      setFocusedNodeId(previousNodeId);
      setFocusHistory(focusHistory.slice(0, -1));
      return;
    }

    const existingHistoryIndex = focusHistory.indexOf(nextNodeId);
    if (existingHistoryIndex !== -1) {
      setFocusedNodeId(nextNodeId);
      setFocusHistory(focusHistory.slice(0, existingHistoryIndex));
      return;
    }

    setFocusHistory(focusedNodeId ? [...focusHistory, focusedNodeId] : []);
    setFocusedNodeId(nextNodeId);
  }

  return (
    <Screen title="Graph">
      <LibraryTabs />
      <div className="notice graph-explainer">
        <strong>Context graph, not storage inventory</strong>
        <p>
          The default view shows repos, workstreams, topics, services, packages, and diagram groups that organize usable memory.
          Click a node or choose a focus to inspect nearby docs, diagrams, sessions, and files.
        </p>
      </div>
      <div className="graph-view-toolbar">
        <div className="segmented-control compact graph-mode-control" role="group" aria-label="Graph view">
          <button
            type="button"
            className={graphViewMode === "context" ? "selected" : ""}
            onClick={() => setGraphViewMode("context")}
          >
            Context map
          </button>
          <button
            type="button"
            className={graphViewMode === "all" ? "selected" : ""}
            onClick={() => {
              setGraphViewMode("all");
              setFocusHistory([]);
            }}
          >
            Import audit
          </button>
        </div>
        <label className="graph-focus-control">
          <span>Focus</span>
          <select
            value={focusedNodeId}
            disabled={isRawGraph || focusOptions.length === 0}
            onChange={(event) => {
              setGraphFocusFromControl(event.target.value);
            }}
          >
            <option value="">Overview hubs</option>
            {focusOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        {focusedNodeId && !isRawGraph ? (
          <button
            className="icon-text-button"
            type="button"
            onClick={resetGraphFocus}
          >
            <X size={14} />
            Reset focus
          </button>
        ) : null}
        <div className="graph-summary-bar">
          <span>{isRawGraph ? graphStats.nodes : graphElements.nodes.length} {isRawGraph ? "stored nodes" : "visible nodes"}</span>
          <span>{isRawGraph ? graphStats.relationships : graphElements.edges.length} {isRawGraph ? "context links indexed" : "visible links"}</span>
          {!isRawGraph && graphElements.hiddenLeafNodes ? <span>{graphElements.hiddenLeafNodes} leaf nodes hidden</span> : null}
          {isRawGraph ? <span>{graphStats.memberships} storage ownership links</span> : <span>{graphElements.hiddenMemberships} storage links hidden</span>}
          {graph?.generated ? <span>{graph.displayProjected ? "Projected" : "Generated"} {formatShortDateTime(graph.generated)}</span> : null}
        </div>
      </div>
      <div className={`graph-mode-note ${isRawGraph ? "warning" : ""}`}>
        {isRawGraph ? (
          <>
            <strong>Import audit:</strong> a record inventory for the current project graph: stored nodes, project ownership links, and derived context relationships from imports and metadata.
          </>
        ) : focusedNodeId ? (
          <>
            <strong>Focused neighborhood:</strong> showing nearby relationships around {graphElements.focusLabel || "the selected node"}. Use this when continuing work on a service, package, topic, or diagram set.
          </>
        ) : (
          <>
            <strong>Context map:</strong> showing high-signal hubs first. Plain project ownership links and leaf docs stay hidden until you focus a node.
          </>
        )}
      </div>
      {!isRawGraph && graphElements.edgeTypes.length ? (
        <div className="graph-edge-summary" aria-label="Relationship summary">
          {graphElements.edgeTypes.map((item) => (
            <span key={item.type}>{graphEdgeLabel(item.type)} {item.count}</span>
          ))}
        </div>
      ) : null}
      {!isRawGraph ? (
        <div className="graph-legend" aria-label="Graph legend">
          {[
            ["project", "Project"],
            ["repo", "Repo / workstream"],
            ["session", "Session / task"],
            ["doc", "Doc"],
            ["diagram", "Diagram"],
            ["file", "File / reference"]
          ].map(([kind, label]) => (
            <span key={kind}>
              <i className={`graph-legend-dot graph-flow-node-${kind}`} aria-hidden="true" />
              {label}
            </span>
          ))}
          {[
            ["topic", "Topic"],
            ["service", "Service"],
            ["package", "Package"],
            ["diagram-group", "Diagram group"]
          ].map(([kind, label]) => (
            <span key={kind}>
              <i className={`graph-legend-dot graph-flow-node-${kind}`} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="graph-board">
        {isRawGraph ? (
          <RawStorageAudit graph={graph} />
        ) : graphElements.nodes.length ? (
          <ReactFlow
            className="graph-flow"
            key={graphFlowKey}
            nodes={graphElements.nodes}
            edges={graphElements.edges}
            defaultViewport={{ x: 64, y: 72, zoom: 0.72 }}
            fitView
            fitViewOptions={{ padding: 0.16 }}
            minZoom={0.12}
            maxZoom={2.4}
            nodesConnectable={false}
            onlyRenderVisibleElements
            onNodeClick={(_, node) => {
              const documentId = graphDocumentIdForFlowNode(node);
              if (documentId) {
                setEditingDocId(documentId);
                return;
              }
              if (isGraphFocusableNodeId(node.id)) {
                navigateGraphFocus(node.id);
              }
            }}
          >
            <Background gap={28} size={1} />
            <MiniMap nodeColor={(node) => graphMiniMapColor(node)} pannable zoomable />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <div className="graph-empty-state">
            <strong>No useful links yet</strong>
            <p>
              This project currently has only storage membership links or no focusable hubs.
              Import paths, topics, workstreams, sessions, files, and reviewed AI proposals can create context graph links.
            </p>
            <button type="button" onClick={() => setGraphViewMode("all")}>Show import audit</button>
          </div>
        )}
      </div>
      {editingDoc ? (
        <DocumentEditorModal
          doc={editingDoc}
          saving={store.loading}
          onClose={() => setEditingDocId("")}
          onSave={(changes) => store.updateDocument(editingDoc.id, changes)}
          onDelete={async () => {
            await store.deleteDocument(editingDoc.id);
            setEditingDocId("");
          }}
        />
      ) : null}
    </Screen>
  );
});

type GraphViewMode = "context" | "all";

function enhanceGraphForDisplay(graph: any, docs: any[] = []): any {
  const nodes: any[] = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges: any[] = Array.isArray(graph?.edges) ? graph.edges : [];
  const docById = new Map<string, any>(docs.map((doc) => [doc.id, doc]));
  const enhancedNodes = nodes.map((sourceNode: any) => {
    if (!String(sourceNode.id || "").startsWith("doc:")) return sourceNode;
    const doc = docById.get(String(sourceNode.id).slice("doc:".length));
    if (!doc) return sourceNode;
    return {
      ...sourceNode,
      documentType: doc.type,
      status: sourceNode.status || doc.status,
      visibility: sourceNode.visibility || doc.visibility,
      path: sourceNode.path || sourceNode.filePath || doc.filePath || doc.path || doc.importSourcePath
    };
  });
  if (edges.some((sourceEdge: any) => sourceEdge.type !== "belongs-to")) {
    return {
      ...graph,
      nodes: enhancedNodes
    };
  }

  const nextNodes = new Map<string, any>(enhancedNodes.map((sourceNode: any) => [sourceNode.id, sourceNode]));
  const nextEdges = new Map<string, any>(edges.map((sourceEdge: any) => [sourceEdge.id, sourceEdge]));
  const repos = enhancedNodes.filter((sourceNode: any) => sourceNode.type === "repo");
  const projectId = String(graph?.projectId || nodes[0]?.projectId || "project");

  function addNode(node: any) {
    if (!nextNodes.has(node.id)) nextNodes.set(node.id, node);
  }

  function addEdge(from: string, to: string, type: string, reason: string) {
    const id = `${from}->${type}->${to}`;
    if (!nextEdges.has(id)) {
      nextEdges.set(id, { id, projectId, from, to, type, reason });
    }
  }

  for (const doc of enhancedNodes.filter((sourceNode: any) => isGraphLeafNode(sourceNode))) {
    const segments = graphPathSegments(doc.path);
    if (!segments.length) continue;

    const category = graphSlug(segments[0]);
    if (category && !GRAPH_DISPLAY_STOPWORDS.has(category)) {
      const topicNode = graphDisplayNode(projectId, "topic", category, graphLabel(category));
      addNode(topicNode);
      addEdge(doc.id, topicNode.id, "mentions", "Document path groups this memory under a topic");
    }

    const area = graphDisplayAreaFromSegments(segments);
    if (area) {
      const areaNode = graphDisplayNode(projectId, area.type, area.slug, area.label, area.path);
      addNode(areaNode);
      addEdge(doc.id, areaNode.id, doc.type === "diagram" ? "explains" : "supports", "Document path identifies this context area");

      if (category && !GRAPH_DISPLAY_STOPWORDS.has(category)) {
        addEdge(`topic:${category}`, areaNode.id, "contains", "Imported memory path groups this context area under the topic");
      }

      for (const repo of reposForDisplayArea(repos, area, category)) {
        addEdge(repo.id, areaNode.id, "contains", "Linked repo contains or owns this context area");
      }
    }

    const diagramGroup = graphDisplayDiagramGroupFromSegments(segments);
    if (diagramGroup) {
      const diagramsTopic = graphDisplayNode(projectId, "topic", "diagrams", "Diagrams");
      const groupNode = graphDisplayNode(projectId, "diagram-group", diagramGroup.slug, diagramGroup.label);
      addNode(diagramsTopic);
      addNode(groupNode);
      addEdge(diagramsTopic.id, groupNode.id, "contains", "Imported diagram path groups this diagram collection");
      addEdge(groupNode.id, doc.id, "contains", "Diagram belongs to this diagram collection");
      addEdge(doc.id, groupNode.id, "explains", "Diagram is part of this context diagram collection");
    }
  }

  return {
    ...graph,
    nodes: [...nextNodes.values()],
    edges: [...nextEdges.values()],
    displayProjected: true
  };
}

function graphDisplayNode(projectId: string, type: string, slug: string, label: string, path?: string): any {
  return {
    id: `${type}:${slug}`,
    projectId,
    type,
    label,
    path
  };
}

function graphPathSegments(input: string | undefined): string[] {
  const normalized = String(input || "").replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  const marker = lower.lastIndexOf("/markdown-memory/");
  const memoryMarker = lower.lastIndexOf("/docs/memory/");
  const importedDocsMarker = lower.lastIndexOf("/docs/imported/");
  const importedSessionsMarker = lower.lastIndexOf("/sessions/imported/");
  let relativePath = "";
  if (marker !== -1) {
    relativePath = normalized.slice(marker + "/markdown-memory/".length);
  } else if (memoryMarker !== -1) {
    relativePath = normalized.slice(memoryMarker + "/docs/memory/".length);
  } else if (importedDocsMarker !== -1) {
    relativePath = graphStripImportedProfile(normalized.slice(importedDocsMarker + "/docs/imported/".length));
  } else if (importedSessionsMarker !== -1) {
    relativePath = graphStripImportedProfile(normalized.slice(importedSessionsMarker + "/sessions/imported/".length));
  }
  if (!relativePath) return [];
  const parts = relativePath
    .split("/")
    .map((part) => graphSlug(part.replace(/\.md$/i, "")))
    .filter(Boolean);
  return parts.slice(0, -1);
}

function graphStripImportedProfile(relativePath: string): string {
  return relativePath.split("/").filter(Boolean).slice(1).join("/");
}

function graphDisplayAreaFromSegments(segments: string[]): { type: string; slug: string; label: string; path: string } | undefined {
  const [category, second, third] = segments.map(graphSlug);
  if (category === "backend") {
    const slug = graphIsBackendGroupSegment(second) && third ? third : second;
    if (!slug || GRAPH_DISPLAY_STOPWORDS.has(slug)) return undefined;
    return { type: "service", slug, label: graphLabel(slug), path: segments.join("/") };
  }
  if (category === "frontend") {
    if (!second || GRAPH_DISPLAY_STOPWORDS.has(second)) return undefined;
    return { type: "package", slug: second, label: graphLabel(second), path: segments.join("/") };
  }
  if (category === "diagrams" && second === "projects" && third) {
    return { type: "service", slug: third, label: graphLabel(third), path: segments.join("/") };
  }
  return undefined;
}

function graphDisplayDiagramGroupFromSegments(segments: string[]): { slug: string; label: string } | undefined {
  const [category, second, third] = segments.map(graphSlug);
  if (category !== "diagrams") return undefined;
  if (second === "projects" && third) return { slug: third, label: `${graphLabel(third)} diagrams` };
  return { slug: "system", label: "System diagrams" };
}

function reposForDisplayArea(repos: any[], area: { type: string; slug: string }, category: string): any[] {
  return repos.filter((repo) => {
    const haystack = `${repo.id} ${repo.label} ${repo.path}`.toLowerCase();
    if (haystack.includes(area.slug)) return true;
    if (category === "frontend" || area.type === "package") return haystack.includes("frontend") || haystack.includes("package") || haystack.includes("app");
    if (category === "backend" || area.type === "service") return haystack.includes("backend") || haystack.includes("service") || haystack.includes("api") || haystack.includes("worker");
    return false;
  });
}

function graphIsBackendGroupSegment(slug: string | undefined): boolean {
  return slug === "services" || slug === "backend-services" || Boolean(slug?.endsWith("-services") || slug?.endsWith("-service"));
}

function graphSlug(input: string | undefined): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/_/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function graphLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (part === "api") return "API";
      if (part === "ui") return "UI";
      if (part === "sdk") return "SDK";
      if (part === "mcp") return "MCP";
      if (part === "rbac") return "RBAC";
      if (part === "trpc") return "tRPC";
      return part.slice(0, 1).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

const GRAPH_DISPLAY_STOPWORDS = new Set(["imported", "markdown", "markdown-memory", "memory", "readme"]);

function RawStorageAudit({ graph }: { graph: any }) {
  const nodes: any[] = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges: any[] = Array.isArray(graph?.edges) ? graph.edges : [];
  const nodeTypes = summarizeNodeTypes(nodes);
  const edgeTypes = summarizeEdgeTypes(edges);
  const storageEdges = edges.filter((sourceEdge: any) => sourceEdge.type === "belongs-to");
  const contextEdges = edges.filter((sourceEdge: any) => sourceEdge.type !== "belongs-to");

  return (
    <div className="graph-audit-panel">
      <div className="graph-audit-summary">
        <div>
          <strong>{nodes.length}</strong>
          <span>stored graph nodes</span>
        </div>
        <div>
          <strong>{storageEdges.length}</strong>
          <span>storage ownership links</span>
        </div>
        <div>
          <strong>{contextEdges.length}</strong>
          <span>context relationships</span>
        </div>
      </div>
      <div className="graph-audit-grid">
        <section>
          <h3>Indexed Node Types</h3>
          <AuditRows rows={nodeTypes} />
        </section>
        <section>
          <h3>Indexed Relationship Types</h3>
          <AuditRows rows={edgeTypes} />
        </section>
      </div>
      <p className="graph-audit-note">
        Storage ownership links are intentionally excluded from the context map because they only mean the item is stored in this project.
      </p>
    </div>
  );
}

function AuditRows({ rows }: { rows: Array<{ type: string; count: number }> }) {
  if (!rows.length) return <p className="empty-inline">No indexed rows.</p>;
  return (
    <div className="graph-audit-rows">
      {rows.map((row) => (
        <div key={row.type}>
          <span>{graphEdgeLabel(row.type)}</span>
          <strong>{row.count}</strong>
        </div>
      ))}
    </div>
  );
}

interface GraphFocusOption {
  id: string;
  label: string;
  type: string;
  degree: number;
}

interface GraphFlowElements {
  nodes: Node[];
  edges: Edge[];
  edgeTypes: Array<{ type: string; count: number }>;
  hiddenMemberships: number;
  hiddenLeafNodes: number;
  focusLabel?: string;
}

function buildGraphFlowElements(graph: any, viewMode: GraphViewMode, focusedNodeId = ""): GraphFlowElements {
  const allNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const allEdges = Array.isArray(graph?.edges) ? graph.edges : [];
  const nodeById = new Map<string, any>(allNodes.map((sourceNode: any) => [sourceNode.id, sourceNode]));
  const graphSelection = selectGraphEdgesForView(allEdges, allNodes, viewMode, focusedNodeId);
  const visibleEdges = graphSelection.edges;
  const visibleNodeIds = graphSelection.nodeIds;
  const hiddenMemberships = allEdges.filter((sourceEdge: any) => sourceEdge.type === "belongs-to").length - visibleEdges.filter((sourceEdge: any) => sourceEdge.type === "belongs-to").length;

  const sourceNodes = allNodes.filter((sourceNode: any) => visibleNodeIds.has(sourceNode.id));
  const hiddenLeafNodes = viewMode === "all" ? 0 : allNodes.filter((sourceNode: any) => !visibleNodeIds.has(sourceNode.id) && isGraphLeafNode(sourceNode)).length;
  const laneCounts = new Map<string, number>();
  const nodeIds = new Set<string>();

  const nodes: Node[] = sourceNodes.map((sourceNode: any) => {
    const lane = graphLaneForNode(sourceNode);
    const laneIndex = laneCounts.get(lane.key) || 0;
    laneCounts.set(lane.key, laneIndex + 1);
    nodeIds.add(sourceNode.id);

    const wrappedColumn = Math.floor(laneIndex / lane.wrapAfter);
    const row = laneIndex % lane.wrapAfter;
    const nodeType = String(sourceNode.type || "doc");

    return {
      id: sourceNode.id,
      type: "default",
      position: {
        x: lane.x + wrappedColumn * 280,
        y: 72 + row * 112
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      className: `graph-flow-node graph-flow-node-${safeGraphClassName(nodeType)}`,
      data: {
        graphNode: sourceNode,
        label: <GraphFlowNodeLabel node={sourceNode} />
      }
    };
  });

  const edges: Edge[] = visibleEdges
    .filter((sourceEdge: any) => nodeIds.has(sourceEdge.from) && nodeIds.has(sourceEdge.to))
    .map((sourceEdge: any) => {
      const edgeType = String(sourceEdge.type || "related");
      const displayEdge = graphDisplayEdge(sourceEdge, viewMode);
      const edgeColor = graphEdgeColor(edgeType);
      return {
        id: sourceEdge.id,
        source: displayEdge.source,
        target: displayEdge.target,
        type: "simplebezier",
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
        className: `graph-flow-edge graph-flow-edge-${safeGraphClassName(edgeType)}`,
        style: { stroke: edgeColor },
        label: undefined,
        data: {
          label: displayEdge.label,
          relationship: edgeType,
          reason: sourceEdge.reason || ""
        }
      };
    });

  return {
    nodes,
    edges,
    edgeTypes: summarizeEdgeTypes(visibleEdges),
    hiddenMemberships: Math.max(0, hiddenMemberships),
    hiddenLeafNodes,
    focusLabel: focusedNodeId ? nodeById.get(focusedNodeId)?.label : undefined
  };
}

function selectGraphEdgesForView(edges: any[], nodes: any[], viewMode: GraphViewMode, focusedNodeId: string): { edges: any[]; nodeIds: Set<string> } {
  if (viewMode === "all") {
    return {
      edges,
      nodeIds: new Set<string>(nodes.map((sourceNode: any) => sourceNode.id))
    };
  }

  const contextEdges = edges.filter((sourceEdge: any) => isContextGraphEdge(sourceEdge));
  if (focusedNodeId) {
    const nodeIds = trimFocusedGraphNodeIds(nodes, graphNeighborhoodNodeIds(contextEdges, focusedNodeId, graphFocusedNeighborhoodDistance(nodes, focusedNodeId)), focusedNodeId);
    const selectedEdges = contextEdges.filter((sourceEdge: any) => nodeIds.has(sourceEdge.from) && nodeIds.has(sourceEdge.to));
    return { edges: selectedEdges, nodeIds };
  }

  const anchorNodeIds = new Set(nodes.filter((sourceNode: any) => isGraphAnchorNode(sourceNode)).map((sourceNode: any) => sourceNode.id));
  const selectedEdges = contextEdges.filter((sourceEdge: any) => anchorNodeIds.has(sourceEdge.from) && anchorNodeIds.has(sourceEdge.to));
  const nodeIds = new Set<string>();
  for (const sourceEdge of selectedEdges) {
    nodeIds.add(sourceEdge.from);
    nodeIds.add(sourceEdge.to);
  }
  for (const sourceNode of nodes) {
    if (sourceNode.type === "project" || sourceNode.type === "repo" || sourceNode.type === "workstream") nodeIds.add(sourceNode.id);
  }

  return { edges: selectedEdges, nodeIds };
}

function trimFocusedGraphNodeIds(nodes: any[], nodeIds: Set<string>, focusedNodeId: string): Set<string> {
  const nodeById = new Map<string, any>(nodes.map((sourceNode: any) => [sourceNode.id, sourceNode]));
  const focusedType = String(nodeById.get(focusedNodeId)?.type || "");
  const leafLimit = graphFocusedLeafLimit(focusedType);
  const anchorLimit = graphFocusedAnchorLimit(focusedType);
  const anchors: string[] = [];
  const leaves: string[] = [];

  for (const nodeId of nodeIds) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    if (nodeId === focusedNodeId || isGraphAnchorNode(node)) anchors.push(nodeId);
    else leaves.push(nodeId);
  }

  leaves.sort((leftId, rightId) => {
    const left = nodeById.get(leftId);
    const right = nodeById.get(rightId);
    return graphLeafTypeRank(String(left?.type || "")) - graphLeafTypeRank(String(right?.type || "")) ||
      String(left?.label || "").localeCompare(String(right?.label || ""));
  });

  const focusedAnchor = anchors.filter((nodeId) => nodeId === focusedNodeId);
  const relatedAnchors = anchors
    .filter((nodeId) => nodeId !== focusedNodeId)
    .sort((leftId, rightId) => {
      const left = nodeById.get(leftId);
      const right = nodeById.get(rightId);
      return graphFocusTypeRank(String(left?.type || "")) - graphFocusTypeRank(String(right?.type || "")) ||
        String(left?.label || "").localeCompare(String(right?.label || ""));
    });

  return new Set([...focusedAnchor, ...relatedAnchors.slice(0, anchorLimit), ...leaves.slice(0, leafLimit)]);
}

function graphDisplayEdge(sourceEdge: any, viewMode: GraphViewMode): { source: string; target: string; label?: string } {
  const edgeType = String(sourceEdge.type || "related");
  const from = String(sourceEdge.from || "");
  const to = String(sourceEdge.to || "");

  if (edgeType === "belongs-to") {
    return {
      source: to,
      target: from,
      label: viewMode === "context" ? graphMembershipLabel(from) : undefined
    };
  }

  if ((edgeType === "supports" || edgeType === "explains" || edgeType === "mentions") && isContextEntityNodeId(to)) {
    return {
      source: to,
      target: from,
      label: edgeType === "mentions" ? "mentions" : "memory"
    };
  }

  return {
    source: from,
    target: to,
    label: graphEdgeLabel(edgeType)
  };
}

function isContextGraphEdge(edge: any): boolean {
  const edgeType = String(edge.type || "");
  if (edgeType !== "belongs-to") return true;
  const from = String(edge.from || "");
  const to = String(edge.to || "");
  return to.startsWith("project:") && (from.startsWith("repo:") || from.startsWith("workstream:"));
}

function graphNeighborhoodNodeIds(edges: any[], focusedNodeId: string, maxDistance: number): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const visited = new Set<string>([focusedNodeId]);
  const queue: Array<{ id: string; distance: number }> = [{ id: focusedNodeId, distance: 0 }];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.distance >= maxDistance) continue;
    for (const next of adjacency.get(current.id) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push({ id: next, distance: current.distance + 1 });
    }
  }
  return visited;
}

function getGraphFocusOptions(graph: any): GraphFocusOption[] {
  const nodes: any[] = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges: any[] = Array.isArray(graph?.edges) ? graph.edges.filter((sourceEdge: any) => isContextGraphEdge(sourceEdge)) : [];
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }

  return nodes
    .filter((sourceNode: any) => isGraphFocusableNode(sourceNode) && (degree.get(sourceNode.id) || 0) > 0)
    .map((sourceNode: any): GraphFocusOption => ({
      id: sourceNode.id,
      label: `${sourceNode.label} (${graphNodeTypeLabel(sourceNode.type)}, ${degree.get(sourceNode.id) || 0})`,
      type: String(sourceNode.type || ""),
      degree: degree.get(sourceNode.id) || 0
    }))
    .sort((left, right) => graphFocusTypeRank(left.type) - graphFocusTypeRank(right.type) || right.degree - left.degree || left.label.localeCompare(right.label))
    .slice(0, 90);
}

function isGraphAnchorNode(node: any): boolean {
  const type = String(node?.type || "");
  return [
    "project",
    "repo",
    "workstream",
    "topic",
    "service",
    "package",
    "diagram-group",
    "code-area",
    "task"
  ].includes(type);
}

function isGraphLeafNode(node: any): boolean {
  const type = String(node?.type || "");
  return ["doc", "diagram", "file", "session", "decision", "command", "gotcha", "external-reference"].includes(type);
}

function isGraphFocusableNode(node: any): boolean {
  return isGraphFocusableNodeId(String(node?.id || ""));
}

function isGraphFocusableNodeId(id: string): boolean {
  return [
    "repo:",
    "workstream:",
    "topic:",
    "service:",
    "package:",
    "diagram-group:",
    "code-area:",
    "task:"
  ].some((prefix) => id.startsWith(prefix));
}

function graphDocumentIdForFlowNode(node: Node): string | undefined {
  const graphNode = (node.data as { graphNode?: any } | undefined)?.graphNode;
  const graphType = String(graphNode?.type || "");
  if (!node.id.startsWith("doc:")) return undefined;
  if (!["doc", "diagram", "decision", "command", "gotcha"].includes(graphType)) return undefined;
  return node.id.slice("doc:".length);
}

function isContextEntityNodeId(id: string): boolean {
  return [
    "repo:",
    "workstream:",
    "topic:",
    "service:",
    "package:",
    "diagram-group:",
    "code-area:",
    "file:"
  ].some((prefix) => id.startsWith(prefix));
}

function graphFocusTypeRank(type: string): number {
  const ranks: Record<string, number> = {
    service: 0,
    package: 1,
    topic: 2,
    "diagram-group": 3,
    repo: 4,
    workstream: 5,
    task: 6,
    session: 7,
    doc: 8
  };
  return ranks[type] ?? 20;
}

function graphLeafTypeRank(type: string): number {
  const ranks: Record<string, number> = {
    session: 0,
    decision: 1,
    diagram: 2,
    doc: 3,
    command: 4,
    gotcha: 5,
    file: 6,
    "external-reference": 7
  };
  return ranks[type] ?? 20;
}

function graphFocusedLeafLimit(type: string): number {
  if (type === "project") return 0;
  if (type === "repo") return 24;
  if (type === "topic") return 28;
  if (type === "workstream") return 24;
  if (type === "service" || type === "package" || type === "diagram-group" || type === "code-area") return 28;
  return 18;
}

function graphFocusedAnchorLimit(type: string): number {
  if (type === "repo") return 18;
  if (type === "topic") return 24;
  if (type === "service" || type === "package" || type === "diagram-group" || type === "code-area") return 12;
  return 18;
}

function graphFocusedNeighborhoodDistance(nodes: any[], focusedNodeId: string): number {
  const focusedNode = nodes.find((node) => node.id === focusedNodeId);
  const focusedType = String(focusedNode?.type || "");
  if (focusedType === "repo" || focusedType === "topic") return 2;
  return 1;
}

function graphEdgeColor(type: string): string {
  if (type === "contains") return "#0f766e";
  if (["supports", "explains", "mentions", "uses"].includes(type)) return "#b87333";
  if (["works-on", "touched", "produced"].includes(type)) return "#c0702d";
  return "#8a8179";
}

function graphNodeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "architecture-decision-record": "ADR",
    "architecture-note": "Architecture",
    "command-note": "Command",
    "diagram-group": "diagram group",
    "code-area": "code area",
    "decision-record": "Decision",
    "design-requirements-document": "Requirements",
    "external-reference": "External",
    "scratch-note": "Scratch Note",
    "technical-spec": "Spec",
    "user-flow": "User Flow"
  };
  return labels[type] || graphLabel(type || "node");
}

function graphMembershipLabel(from: string): string {
  if (from.startsWith("repo:")) return "linked repo";
  if (from.startsWith("workstream:")) return "workstream";
  return "stored in";
}

function getGraphStats(graph: any): { nodes: number; memberships: number; relationships: number; edgeTypes: Array<{ type: string; count: number }> } {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const memberships = edges.filter((sourceEdge: any) => sourceEdge.type === "belongs-to").length;
  const edgeTypes = summarizeEdgeTypes(edges);
  const relationships = Math.max(0, edges.length - memberships);
  return { nodes, memberships, relationships, edgeTypes };
}

function summarizeEdgeTypes(edges: any[]): Array<{ type: string; count: number }> {
  const edgeTypeCounts = new Map<string, number>();
  for (const sourceEdge of edges) {
    edgeTypeCounts.set(sourceEdge.type, (edgeTypeCounts.get(sourceEdge.type) || 0) + 1);
  }
  return [...edgeTypeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));
}

function summarizeNodeTypes(nodes: any[]): Array<{ type: string; count: number }> {
  const nodeTypeCounts = new Map<string, number>();
  for (const sourceNode of nodes) {
    const type = String(sourceNode.type || "node");
    nodeTypeCounts.set(type, (nodeTypeCounts.get(type) || 0) + 1);
  }
  return [...nodeTypeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));
}

function GraphFlowNodeLabel({ node }: { node: any }) {
  const type = String(node.documentType || node.type || "node");
  const metadata = [node.status, node.visibility].filter(Boolean).join(" / ");
  const secondaryMetadata = metadata || (isGraphAnchorNode(node) ? "" : graphNodeTypeLabel(String(node.type || "node")));
  return (
    <div className="graph-flow-node-label">
      <div className="graph-flow-node-type-row">
        <span className={`graph-node-type-badge graph-node-type-${safeGraphClassName(type)}`}>
          {graphNodeTypeLabel(type)}
        </span>
      </div>
      <strong title={node.label}>{node.label}</strong>
      {secondaryMetadata ? <span>{secondaryMetadata}</span> : null}
    </div>
  );
}

function graphLaneForNode(node: any): { key: string; x: number; wrapAfter: number } {
  const type = String(node?.type || "doc");
  if (type === "project") return { key: "project", x: 80, wrapAfter: 999 };
  if (type === "repo" || type === "workstream") return { key: "repo-workstream", x: 380, wrapAfter: 999 };
  if (type === "topic") return { key: "topic", x: 700, wrapAfter: 999 };
  if (type === "service" || type === "package" || type === "code-area" || type === "diagram-group") return { key: "context-entity", x: 1040, wrapAfter: 999 };
  if (type === "session" || type === "task") return { key: "session-task", x: 1400, wrapAfter: 999 };
  if (type === "diagram") return { key: "diagram", x: 1400, wrapAfter: 999 };
  if (type === "file" || type === "external-reference") return { key: "file-reference", x: 1760, wrapAfter: 999 };
  return { key: "knowledge-doc", x: 1400, wrapAfter: 999 };
}

function graphMiniMapColor(node: Node): string {
  const className = String(node.className || "");
  if (className.includes("project")) return "#2563eb";
  if (className.includes("repo")) return "#0891b2";
  if (className.includes("workstream")) return "#7c3aed";
  if (className.includes("topic")) return "#0f766e";
  if (className.includes("service")) return "#dc2626";
  if (className.includes("package")) return "#9333ea";
  if (className.includes("diagram-group")) return "#f97316";
  if (className.includes("session") || className.includes("task")) return "#16a34a";
  if (className.includes("diagram")) return "#f59e0b";
  if (className.includes("file") || className.includes("code-area")) return "#64748b";
  return "#b87333";
}

function graphEdgeLabel(type: string): string {
  const labels: Record<string, string> = {
    "belongs-to": "stored in",
    "works-on": "works on",
    touched: "touched",
    referenced: "references",
    produced: "produced",
    affects: "affects",
    supersedes: "supersedes",
    supports: "supports",
    explains: "explains",
    mentions: "mentions",
    uses: "uses",
    contains: "contains",
    "depends-on": "depends on",
    "blocked-by": "blocked by",
    related: "related"
  };
  return labels[type] || type;
}

function safeGraphClassName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "node";
}

function formatShortDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export const SearchScreen = observer(function SearchScreen() {
  const store = useStore();
  const [query, setQuery] = useState("");
  return (
    <Screen title="Search This Project">
      <form className="inline-form" onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void store.search(query);
      }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions, docs, commands, gotchas, diagrams" />
        <button type="submit">Search</button>
      </form>
      <DataTable columns={["type", "status", "visibility", "title", "snippet"]} rows={store.searchResults} />
    </Screen>
  );
});

export const InboxScreen = observer(function InboxScreen() {
  const store = useStore();
  const [selectedProposalId, setSelectedProposalId] = useState("");
  const selectedProposal = store.inbox.find((item) => item.id === selectedProposalId) || store.inbox[0];
  const graphProposalRules = selectedProposal?.type === "graph-update"
    ? graphRulesFromProposalPatch(selectedProposal.proposedPatch)
    : undefined;
  return (
    <Screen title="Memory Inbox">
      <LibraryTabs />
      <DataTable columns={["created", "status", "type", "confidence", "reason"]} rows={store.inbox} />
      {selectedProposal ? (
        <Panel title="Selected Proposal">
          <div className="inline-form compact">
            <select value={selectedProposal.id} onChange={(event) => setSelectedProposalId(event.target.value)}>
              {store.inbox.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.status} - {item.type} - {item.reason}
                </option>
              ))}
            </select>
            <ConfirmDeleteButton
              itemType="inbox-proposal"
              title={selectedProposal.reason || selectedProposal.type}
              label="Move to Trash"
              onConfirm={() => store.deleteInboxItem(selectedProposal.id)}
            />
            <button type="button" onClick={() => store.updateInboxStatus(selectedProposal.id, "accepted")}>Mark Accepted</button>
            <button type="button" onClick={() => store.updateInboxStatus(selectedProposal.id, "rejected")}>Reject</button>
            {graphProposalRules ? (
              <button type="button" onClick={() => store.applyGraphRulesProposal(selectedProposal.id, graphProposalRules)}>
                Apply Graph Rules
              </button>
            ) : null}
          </div>
          <KeyValue label="Type" value={selectedProposal.type} />
          <KeyValue label="Source" value={selectedProposal.sourceAgent || selectedProposal.sourceKind || "unknown"} />
          <KeyValue label="Confidence" value={selectedProposal.confidence || "unknown"} />
          <KeyValue label="Reason" value={selectedProposal.reason} />
          <pre className="markdown-preview">{selectedProposal.proposedPatch || "No proposed patch provided."}</pre>
        </Panel>
      ) : null}
    </Screen>
  );
});

function graphRulesFromProposalPatch(proposedPatch: string | undefined): any[] | undefined {
  if (!proposedPatch?.trim()) return undefined;
  try {
    const parsed = JSON.parse(proposedPatch);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.graphRules)) return parsed.graphRules;
    if (Array.isArray(parsed?.graph_rules)) return parsed.graph_rules;
  } catch {
    return undefined;
  }
  return undefined;
}

export const ContextScreen = observer(function ContextScreen() {
  const store = useStore();
  return (
    <Screen title="AI Context for This Session">
      <LibraryTabs />
      <Panel title="Bundle Summary">
        <KeyValue label="Safety" value={store.contextBundle?.safetyStatus || "unknown"} />
        <KeyValue label="Tokens" value={store.contextBundle?.tokenEstimate || 0} />
        <KeyValue label="Included" value={store.contextBundle?.includedItems?.length || 0} />
        <KeyValue label="Excluded" value={store.contextBundle?.excludedItems?.length || 0} />
      </Panel>
      <pre className="markdown-preview">{store.contextBundle?.markdown || "No context bundle available."}</pre>
    </Screen>
  );
});

export const ImportScreen = observer(function ImportScreen() {
  const store = useStore();
  const [sourceRoot, setSourceRoot] = useState("");
  const [profile, setProfile] = useState("generic-markdown");
  const [limit, setLimit] = useState("");
  const [conflictStrategy, setConflictStrategy] = useState("skip");

  useEffect(() => {
    if (!store.importProfiles.length) void store.loadImportProfiles();
  }, [store]);

  useEffect(() => {
    if (store.importProfiles.length && !store.importProfiles.some((candidate) => candidate.name === profile)) {
      setProfile(store.importProfiles[0].name);
    }
  }, [store.importProfiles, profile]);

  const candidates = store.importPlan?.candidates || [];
  const selectedProfile = store.importProfiles.find((candidate) => candidate.name === profile);
  const importPresets = [
    { label: "Memory Docs", profile: "markdown-memory", help: "Old MEMORY folders" },
    { label: "Session History", profile: "markdown-sessions", help: "Old SESSIONS folders" },
    { label: "Mixed Workspace", profile: "workspace-markdown", help: "One folder with both" }
  ].filter((preset) => store.importProfiles.some((candidate) => candidate.name === preset.profile));

  return (
    <Screen title="Import">
      <Panel title="How Imports Work">
        <ol className="setup-steps">
          <li>Select or create the memory project that should receive the import.</li>
          <li>Pick the folder that contains old Markdown memory, docs, or session files.</li>
          <li>Preview first. The preview is read-only and shows what will become docs or sessions.</li>
          <li>Commit only after the counts and sample rows look right.</li>
        </ol>
        <p className="panel-help">
          If old memory and sessions live in separate folders, import them one folder at a time: memory docs first, then session history.
        </p>
      </Panel>
      <Panel title="Prepare Import">
        <form className="stacked-form" onSubmit={(event) => {
          event.preventDefault();
          void store.prepareImport({
            sourceRoot,
            profile,
            limit: limit ? Number(limit) : undefined
          });
        }}>
          {importPresets.length ? (
            <div className="quick-presets" aria-label="Import type presets">
              {importPresets.map((preset) => (
                <button
                  key={preset.profile}
                  type="button"
                  className={profile === preset.profile ? "selected" : ""}
                  onClick={() => setProfile(preset.profile)}
                >
                  <span>{preset.label}</span>
                  <small>{preset.help}</small>
                </button>
              ))}
            </div>
          ) : null}
          <label>
            <span>Source folder</span>
            <DirectoryField value={sourceRoot} onChange={setSourceRoot} placeholder="D:\\path\\to\\old\\MEMORY-or-SESSIONS" required />
          </label>
          <label>
            <span>Profile</span>
            <select value={profile} onChange={(event) => setProfile(event.target.value)}>
              {store.importProfiles.map((candidate) => (
                <option key={candidate.name} value={candidate.name}>{candidate.name}</option>
              ))}
            </select>
            {selectedProfile?.description ? (
              <p className="field-help">{selectedProfile.description}</p>
            ) : null}
          </label>
          <label>
            <span>Limit</span>
            <input type="number" min="1" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="optional" />
            <p className="field-help">Use a small limit for a first test import. Leave empty to preview the whole folder.</p>
          </label>
          {!store.selectedProjectId ? (
            <p className="field-help">Create or select a project before importing.</p>
          ) : null}
          <button type="submit" disabled={!store.selectedProjectId}>Preview Only</button>
        </form>
      </Panel>
      {store.importPlan ? (
        <Panel title="Import Plan">
          <p className="panel-help">Nothing has been written yet. Review the counts and sample rows before committing.</p>
          <div className="dashboard-grid tight">
            <KeyValue label="Plan" value={store.importPlan.id} />
            <KeyValue label="Profile" value={store.importPlan.profileName} />
            <KeyValue label="Total" value={store.importPlan.counts?.total || 0} />
            <KeyValue label="Documents" value={store.importPlan.counts?.documents || 0} />
            <KeyValue label="Sessions" value={store.importPlan.counts?.sessions || 0} />
            <KeyValue label="Warnings" value={store.importPlan.counts?.warnings || 0} />
          </div>
          <form className="inline-form" onSubmit={(event) => {
            event.preventDefault();
            void store.commitImport(conflictStrategy);
          }}>
            <select value={conflictStrategy} onChange={(event) => setConflictStrategy(event.target.value)}>
              <option value="skip">Skip conflicts</option>
              <option value="overwrite">Overwrite conflicts</option>
              <option value="duplicate">Duplicate conflicts</option>
            </select>
            <button type="submit">Commit Reviewed Import</button>
          </form>
          <DataTable columns={["kind", "title", "relativePath", "targetPath", "warnings"]} rows={candidates.slice(0, 40).map((candidate: any) => ({
            ...candidate,
            warnings: Array.isArray(candidate.warnings) ? candidate.warnings.length : 0
          }))} />
        </Panel>
      ) : null}
      {store.importResult ? (
        <Panel title="Import Result">
          <KeyValue label="Committed" value={store.importResult.committed || 0} />
          <KeyValue label="Documents" value={store.importResult.documents || 0} />
          <KeyValue label="Sessions" value={store.importResult.sessions || 0} />
          <KeyValue label="Skipped" value={store.importResult.skipped || 0} />
          <p className="panel-help">Imported items are now available from Sessions, Docs Library, Search, Graph, and Context Preview.</p>
        </Panel>
      ) : null}
    </Screen>
  );
});

export function AssistantScreen() {
  return (
    <Screen title="Memory Assistant">
      <SettingsTabs />
      <Panel title="Local Assistant">
        <p>The assistant runtime is optional. Core project memory, sessions, search, context preview, MCP, CLI, and backups work without a model.</p>
      </Panel>
    </Screen>
  );
}

export const BackupsScreen = observer(function BackupsScreen() {
  const store = useStore();
  useEffect(() => {
    if (store.selectedProjectId) void store.loadBackups();
  }, [store, store.selectedProjectId]);
  return (
    <Screen title="Backups" actions={<button disabled={!store.selectedProjectId} onClick={() => store.loadBackups()}>Refresh</button>}>
      <SettingsTabs />
      <Panel title="Project Snapshot">
        <p>Snapshots copy project memory into `backups/snapshots` while excluding previous backups.</p>
        <button disabled={!store.selectedProjectId} onClick={() => store.createBackup()}>Create Snapshot</button>
      </Panel>
      <Panel title="Snapshots">
        {store.backups.length ? (
          <div className="repo-list">
            {store.backups.map((backup) => (
              <div className="repo-row" key={backup.snapshotPath}>
                <div>
                  <strong>{backup.created}</strong>
                  <span>{backup.snapshotPath}</span>
                  <small>{backup.note}</small>
                </div>
                <ConfirmDeleteButton
                  itemType="backup"
                  title={`Snapshot ${backup.created}`}
                  label="Move to Trash"
                  onConfirm={() => store.deleteBackup(backup.snapshotPath)}
                />
              </div>
            ))}
          </div>
        ) : (
          <Empty text="No snapshots yet." />
        )}
      </Panel>
    </Screen>
  );
});

export const TrashScreen = observer(function TrashScreen() {
  const store = useStore();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    void store.loadTrash();
  }, [store]);

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]);
  }

  function selectAll() {
    setSelectedIds(store.trashItems.map((item) => item.id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  return (
    <Screen title="Trash" actions={<button onClick={() => store.loadTrash()}>Refresh</button>}>
      <Panel title="Trash Controls">
        <div className="button-row">
          <button type="button" disabled={!store.trashItems.length} onClick={selectAll}>Select All</button>
          <button type="button" disabled={!selectedIds.length} onClick={clearSelection}>Clear Selection</button>
          <ConfirmDeleteButton
            itemType="trash-selection"
            title={`${selectedIds.length} selected trash item${selectedIds.length === 1 ? "" : "s"}`}
            critical
            permanent
            disabled={!selectedIds.length}
            label="Delete Selected Permanently"
            onConfirm={() => store.emptyTrash(selectedIds).then(() => setSelectedIds([]))}
          />
        </div>
        <p className="panel-help">
          Items in trash are removed from active project views but can be restored until they are permanently deleted.
        </p>
      </Panel>
      <Panel title="Deleted Items">
        {store.trashItems.length ? (
          <div className="repo-list">
            {store.trashItems.map((item) => (
              <div className="repo-row" key={item.id}>
                <label className="trash-select">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelected(item.id)}
                  />
                  <span className="sr-only">Select {item.title}</span>
                </label>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.type} {item.projectName ? `in ${item.projectName}` : ""}</span>
                  <small>{item.deletedAt}</small>
                  {item.originalPath ? <small>{item.originalPath}</small> : null}
                </div>
                <div className="row-actions">
                  <button type="button" disabled={!item.canRestore} onClick={() => store.restoreTrashItem(item.id)}>Restore</button>
                  <ConfirmDeleteButton
                    itemType={`trash-${item.type}`}
                    title={item.title}
                    critical
                    permanent
                    label="Delete Permanently"
                    onConfirm={() => store.purgeTrashItem(item.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="Trash is empty." />
        )}
      </Panel>
    </Screen>
  );
});

export const SettingsScreen = observer(function SettingsScreen() {
  const store = useStore();
  const project = store.selectedProject;
  const memoryWritePolicy = store.selectedMemoryWritePolicy;
  const [graphRulesDraft, setGraphRulesDraft] = useState("[]");
  const [graphRulesError, setGraphRulesError] = useState("");
  const graphRulesSignature = JSON.stringify(project?.graphRules || []);

  useEffect(() => {
    setGraphRulesDraft(JSON.stringify(project?.graphRules || [], null, 2));
    setGraphRulesError("");
  }, [project?.id, graphRulesSignature]);

  return (
    <Screen title="Project Settings">
      <SettingsTabs />
      <Panel title="Project">
        <KeyValue label="ID" value={project?.id || "None"} />
        <KeyValue label="Memory root" value={project?.memoryRoot || "None"} />
        <KeyValue label="Linked repos" value={project?.repos?.length || 0} />
        <KeyValue label="Startup mode" value={project?.contextPolicy?.startupMode || "None"} />
        <KeyValue label="Assistant" value={project?.assistantPolicy?.runtimeType || "disabled"} />
      </Panel>
      <Panel title="Memory Write Mode">
        <p className="panel-help">
          Direct mode lets connected agents save session progress and durable project memory without sending every update through the inbox.
        </p>
        <div className="stacked-form">
          <label>
            <span>Review mode</span>
            <select
              value={memoryWritePolicy.reviewMode}
              disabled={!store.selectedProjectId}
              onChange={(event) => {
                const reviewMode = event.target.value;
                return store.updateMemoryWritePolicy({
                  reviewMode,
                  allowAgentDirectWrites: reviewMode === "all" ? false : true
                });
              }}
            >
              <option value="off">Off - write directly</option>
              <option value="risky-only">Risky updates only</option>
              <option value="all">Review every memory update</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={memoryWritePolicy.allowAgentDirectWrites}
              disabled={!store.selectedProjectId || memoryWritePolicy.reviewMode === "all"}
              onChange={(event) => store.updateMemoryWritePolicy({ allowAgentDirectWrites: event.target.checked })}
            />
            <span>Allow agents to write memory directly</span>
          </label>
        </div>
      </Panel>
      <Panel title="Graph Rules">
        <p className="panel-help">
          Rules map imported paths to graph context nodes. Use them when another project stores memory under folders like apps, packages, services, domains, or teams.
        </p>
        <form className="stacked-form" onSubmit={(event) => {
          event.preventDefault();
          try {
            const parsed = JSON.parse(graphRulesDraft || "[]");
            if (!Array.isArray(parsed)) throw new Error("Graph rules must be a JSON array.");
            setGraphRulesError("");
            void store.updateGraphRules(parsed);
          } catch (error) {
            setGraphRulesError(error instanceof Error ? error.message : String(error));
          }
        }}>
          <label>
            <span>Rules JSON</span>
            <textarea
              className="graph-rules-editor"
              value={graphRulesDraft}
              onChange={(event) => setGraphRulesDraft(event.target.value)}
              spellCheck={false}
              placeholder={'[\n  { "match": "apps/*", "nodeType": "package", "topic": "frontend" },\n  { "match": "services/*", "nodeType": "service", "topic": "backend" }\n]'}
            />
          </label>
          {graphRulesError ? <p className="form-error">{graphRulesError}</p> : null}
          <div className="inline-form compact">
            <button type="submit" disabled={!store.selectedProjectId || store.loading}>Save Graph Rules</button>
            <button
              type="button"
              disabled={store.loading}
              onClick={() => {
                setGraphRulesDraft(JSON.stringify(project?.graphRules || [], null, 2));
                setGraphRulesError("");
              }}
            >
              Reset
            </button>
          </div>
        </form>
      </Panel>
    </Screen>
  );
});

function DashboardActions() {
  const store = useStore();
  const [task, setTask] = useState("");
  const [workstreamId, setWorkstreamId] = useState("");
  return (
    <form className="inline-form compact" onSubmit={(event) => {
      event.preventDefault();
      void store.startSession(task, workstreamId ? [workstreamId] : []).then(() => setTask(""));
    }}>
      <input value={task} onChange={(event) => setTask(event.target.value)} placeholder="Optional session title" />
      <select value={workstreamId} onChange={(event) => setWorkstreamId(event.target.value)}>
        <option value="">No workstream</option>
        {store.workstreams.map((workstream) => (
          <option key={workstream.id} value={workstream.id}>{workstream.name}</option>
        ))}
      </select>
      <NavLink className="button-link" to="/workstreams">Create Workstream</NavLink>
      <button type="submit">Start Today's Session</button>
      <button type="button" onClick={() => store.refreshProject()}>Refresh</button>
    </form>
  );
}

function RecentSessions() {
  const store = useStore();
  return (
    <Panel title="Recent Project Sessions">
      <DataTable columns={["updated", "status", "taskTitle"]} rows={store.sessions.slice(0, 6)} />
    </Panel>
  );
}

function Screen({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="screen">
      <div className="screen-heading">
        <h2>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

const workTabs = [
  ["Current Work", "/current-work"],
  ["Sessions", "/sessions"],
  ["Workstreams", "/workstreams"]
] as const;

const libraryTabs = [
  ["Docs", "/docs"],
  ["Diagrams", "/diagrams"],
  ["Inbox", "/inbox"],
  ["Graph", "/graph"],
  ["Context", "/context"]
] as const;

const settingsTabs = [
  ["Project", "/settings"],
  ["Setup", "/setup"],
  ["Assistant", "/assistant"],
  ["Backups", "/backups"]
] as const;

function WorkTabs() {
  return <SectionTabs tabs={workTabs} />;
}

function LibraryTabs() {
  return <SectionTabs tabs={libraryTabs} />;
}

function SettingsTabs() {
  return <SectionTabs tabs={settingsTabs} />;
}

function SectionTabs({ tabs }: { tabs: readonly (readonly [string, string])[] }) {
  return (
    <nav className="section-tabs" aria-label="Section navigation">
      {tabs.map(([label, href]) => (
        <NavLink key={href} to={href} className={({ isActive }) => `section-tab ${isActive ? "active" : ""}`}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DocumentEditorModal({
  doc,
  saving,
  onClose,
  onSave,
  onDelete
}: {
  doc: any;
  saving: boolean;
  onClose: () => void;
  onSave: (changes: { title: string; body: string }) => Promise<any>;
  onDelete: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"markdown" | "preview">("markdown");
  const [title, setTitle] = useState(doc.title || "");
  const [body, setBody] = useState(doc.body || "");
  const [savedTitle, setSavedTitle] = useState(doc.title || "");
  const [savedBody, setSavedBody] = useState(doc.body || "");
  const dirty = title !== savedTitle || body !== savedBody;

  useEffect(() => {
    setMode("markdown");
    setTitle(doc.title || "");
    setBody(doc.body || "");
    setSavedTitle(doc.title || "");
    setSavedBody(doc.body || "");
  }, [doc.id]);

  async function requestClose() {
    if (dirty && !window.confirm("Discard unsaved document changes?")) return;
    onClose();
  }

  async function saveDocument() {
    if (!title.trim()) return;
    const updated = await onSave({ title: title.trim(), body });
    if (!updated) return;
    setTitle(updated.title || title.trim());
    setBody(typeof updated.body === "string" ? updated.body : body);
    setSavedTitle(updated.title || title.trim());
    setSavedBody(typeof updated.body === "string" ? updated.body : body);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        event.preventDefault();
        void requestClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) void requestClose();
      }}
    >
      <section className="document-modal" role="dialog" aria-modal="true" aria-label={`Edit ${doc.title}`}>
        <header className="document-modal-header">
          <div className="document-title-block">
            <input
              className="document-title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Document title"
              placeholder="Document title"
            />
            <div className="doc-badges">
              <span>{doc.type}</span>
              <span>{doc.status}</span>
              <span>{doc.visibility}</span>
              <span>{dirty ? "unsaved" : "saved"}</span>
            </div>
          </div>
          <div className="document-modal-actions">
            <ConfirmDeleteButton
              itemType="document"
              title={doc.title}
              critical={["overview", "privacy", "commands", "glossary"].includes(doc.type)}
              label="Move to Trash"
              onConfirm={onDelete}
            />
            <button type="button" onClick={() => void requestClose()}>Close</button>
            <button type="button" disabled={!dirty || saving || !title.trim()} onClick={() => void saveDocument()}>
              Save
            </button>
          </div>
        </header>
        <div className="document-modal-meta">
          <KeyValue label="Updated" value={doc.updated} />
          <KeyValue label="Import profile" value={doc.importProfile || "none"} />
          <KeyValue label="Source" value={<code className="path-value">{doc.filePath || "memory"}</code>} />
          <KeyValue label="Imported from" value={<code className="path-value">{doc.importSourcePath || "not imported"}</code>} />
        </div>
        <div className="document-editor-toolbar">
          <div className="segmented-control compact" role="group" aria-label="Document editor mode">
            <button type="button" className={mode === "markdown" ? "selected" : ""} onClick={() => setMode("markdown")}>
              Markdown
            </button>
            <button type="button" className={mode === "preview" ? "selected" : ""} onClick={() => setMode("preview")}>
              Preview
            </button>
          </div>
        </div>
        <div className="document-editor-body">
          {mode === "markdown" ? (
            <textarea
              className="markdown-source-editor"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              spellCheck={false}
              aria-label="Markdown source"
            />
          ) : (
            <MarkdownPreview body={body} />
          )}
        </div>
      </section>
    </div>
  );
}

function DataTable({
  columns,
  rows,
  selectedRowId,
  onRowClick,
  rowActions
}: {
  columns: string[];
  rows: any[];
  selectedRowId?: string;
  onRowClick?: (row: any) => void;
  rowActions?: (row: any) => ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{column}</th>)}
            {rowActions ? <th aria-label="Actions">actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={row.id || rowIndex}
              className={`${onRowClick ? "clickable-row" : ""} ${selectedRowId && row.id === selectedRowId ? "selected-row" : ""}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => <td key={column}>{String(row[column] ?? "")}</td>)}
              {rowActions ? (
                <td className="table-actions" onClick={(event) => event.stopPropagation()}>
                  {rowActions(row)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkdownPreview({ body }: { body: string }) {
  if (!body.trim()) return <div className="rendered-markdown empty-preview">No document body recorded.</div>;
  if (isLikelyMermaidSource(body.trim())) {
    return (
      <div className="rendered-markdown">
        <MermaidDiagramPreview source={body.trim()} />
      </div>
    );
  }
  return <div className="rendered-markdown">{renderMarkdownBlocks(body)}</div>;
}

function isLikelyMermaidSource(source: string) {
  return /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|gantt|journey|pie|mindmap|timeline)\b/.test(source);
}

function MermaidDiagramPreview({ source }: { source: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    setViewerOpen(false);
  }, [source]);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      setSvg("");
      setError("");
      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;
        const styles = getComputedStyle(document.documentElement);
        const color = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: "transparent",
            primaryColor: color("--surface", "#fffdf9"),
            primaryTextColor: color("--text", "#241e1a"),
            primaryBorderColor: color("--border", "#ded0c0"),
            lineColor: color("--accent", "#b87333"),
            secondaryColor: color("--surface-2", "#efe5da"),
            tertiaryColor: color("--background", "#f7f3ee")
          }
        });
        const result = await mermaid.render(`aimem-mermaid-${Math.abs(hashString(source))}-${Date.now()}`, source);
        if (!cancelled) setSvg(result.svg);
      } catch (renderError) {
        if (!cancelled) setError(renderError instanceof Error ? renderError.message : String(renderError));
      }
    }

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <div className="diagram-preview mermaid-preview">
      {svg ? (
        <button
          type="button"
          className="diagram-open-button"
          onClick={() => setViewerOpen(true)}
          title="Open larger"
          aria-label="Open diagram larger"
        >
          <Maximize2 size={16} aria-hidden="true" />
        </button>
      ) : null}
      <div className="diagram-preview-canvas">
        {svg ? (
          <MermaidSvgMarkup svg={svg} />
        ) : error ? (
          <div className="mermaid-error">
            <strong>Mermaid could not render this diagram.</strong>
            <pre>{error}</pre>
          </div>
        ) : (
          <div className="diagram-loading">Rendering Mermaid diagram...</div>
        )}
      </div>
      {viewerOpen && svg ? <DiagramFullscreenViewer svg={svg} onClose={() => setViewerOpen(false)} /> : null}
    </div>
  );
}

function MermaidSvgMarkup({ svg, zoom = 1 }: { svg: string; zoom?: number }) {
  return (
    <div
      className="mermaid-svg"
      style={{ "--diagram-svg-width": `${Math.round(zoom * 100)}%` } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function DiagramFullscreenViewer({ svg, onClose }: { svg: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1.25);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const zoomPercent = Math.round(zoom * 100);

  function zoomOut() {
    setZoom((current) => Math.max(0.5, Number((current - 0.25).toFixed(2))));
  }

  function zoomIn() {
    setZoom((current) => Math.min(3, Number((current + 0.25).toFixed(2))));
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        zoomIn();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "-") {
        event.preventDefault();
        zoomOut();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "0") {
        event.preventDefault();
        setZoom(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  useEffect(() => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) return;
    const canvasElement: HTMLDivElement = currentCanvas;

    function handleWheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        setZoom((current) => {
          const next = current + (event.deltaY < 0 ? 0.25 : -0.25);
          return Math.min(3, Math.max(0.5, Number(next.toFixed(2))));
        });
        return;
      }

      if (event.shiftKey && event.deltaY !== 0) {
        if (canvasElement.scrollWidth <= canvasElement.clientWidth) return;
        event.preventDefault();
        event.stopPropagation();
        canvasElement.scrollLeft += event.deltaY;
      }
    }

    canvasElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvasElement.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div
      className="diagram-viewer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="diagram-viewer" role="dialog" aria-modal="true" aria-label="Diagram preview">
        <header className="diagram-viewer-header">
          <div className="diagram-viewer-title">
            <h3>Diagram preview</h3>
            <span>{zoomPercent}%</span>
          </div>
          <div className="diagram-viewer-controls">
            <button type="button" className="icon-button icon-only" onClick={zoomOut} title="Zoom out" aria-label="Zoom out">
              <Minus size={16} aria-hidden="true" />
            </button>
            <button type="button" className="icon-button icon-only" onClick={() => setZoom(1)} title="Reset zoom" aria-label="Reset zoom">
              <RotateCcw size={16} aria-hidden="true" />
            </button>
            <button type="button" className="icon-button icon-only" onClick={zoomIn} title="Zoom in" aria-label="Zoom in">
              <Plus size={16} aria-hidden="true" />
            </button>
            <button type="button" className="icon-button icon-only" onClick={onClose} title="Close" aria-label="Close diagram preview">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div
          className="diagram-viewer-canvas"
          ref={canvasRef}
          role="region"
          aria-label="Scrollable diagram canvas"
          tabIndex={0}
        >
          <MermaidSvgMarkup svg={svg} zoom={zoom} />
        </div>
      </section>
    </div>
  );
}

function renderMarkdownBlocks(markdown: string): ReactNode[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let blockIndex = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    const key = `md-${blockIndex++}`;

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      if (language.toLowerCase() === "mermaid") {
        blocks.push(<MermaidDiagramPreview key={key} source={codeLines.join("\n")} />);
        continue;
      }
      blocks.push(
        <pre key={key}>
          <code>{language ? `${language}\n${codeLines.join("\n")}` : codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const content = renderInlineMarkdown(heading[2], key);
      if (heading[1].length === 1) blocks.push(<h1 key={key}>{content}</h1>);
      else if (heading[1].length === 2) blocks.push(<h2 key={key}>{content}</h2>);
      else if (heading[1].length === 3) blocks.push(<h3 key={key}>{content}</h3>);
      else if (heading[1].length === 4) blocks.push(<h4 key={key}>{content}</h4>);
      else if (heading[1].length === 5) blocks.push(<h5 key={key}>{content}</h5>);
      else blocks.push(<h6 key={key}>{content}</h6>);
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(<hr key={key} />);
      index += 1;
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const header = parseMarkdownTableRow(lines[index]);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(parseMarkdownTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="markdown-table-wrap" key={key}>
          <table className="markdown-table">
            <thead>
              <tr>{header.map((cell, cellIndex) => <th key={`${key}-h-${cellIndex}`}>{renderInlineMarkdown(cell, `${key}-h-${cellIndex}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${key}-r-${rowIndex}`}>
                  {row.map((cell, cellIndex) => <td key={`${key}-r-${rowIndex}-${cellIndex}`}>{renderInlineMarkdown(cell, `${key}-r-${rowIndex}-${cellIndex}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quotes: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quotes.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={key}>{renderInlineMarkdown(quotes.join(" "), key)}</blockquote>);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(<ul key={key}>{items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInlineMarkdown(item, `${key}-${itemIndex}`)}</li>)}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(<ol key={key}>{items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInlineMarkdown(item, `${key}-${itemIndex}`)}</li>)}</ol>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={key}>{renderInlineMarkdown(paragraph.join(" "), key)}</p>);
  }

  return blocks;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+?\*\*|\[[^\]]+?\]\([^)]+?\))/g;
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const token = match[0];
    const key = `${keyPrefix}-inline-${matchIndex++}`;
    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      const link = /^\[([^\]]+?)\]\(([^)]+?)\)$/.exec(token);
      const href = link?.[2] || "";
      const safeHref = /^(https?:|mailto:)/.test(href) ? href : "";
      nodes.push(safeHref ? (
        <a href={safeHref} key={key} rel="noreferrer" target="_blank">{link?.[1]}</a>
      ) : (
        <span key={key}>{link?.[1] || token}</span>
      ));
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function isMarkdownBlockStart(lines: string[], index: number): boolean {
  const trimmed = lines[index]?.trim() || "";
  return trimmed.startsWith("```") ||
    /^#{1,6}\s+/.test(trimmed) ||
    /^(-{3,}|\*{3,})$/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^[-*]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    isMarkdownTableStart(lines, index);
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  const line = lines[index]?.trim() || "";
  const next = lines[index + 1]?.trim() || "";
  return line.includes("|") && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(next);
}

function parseMarkdownTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return hash;
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

function filterDocuments(docs: any[], filter: string): any[] {
  if (filter === "imported") return docs.filter((doc) => Boolean(doc.importSourcePath || doc.importProfile));
  if (filter === "draft") return docs.filter((doc) => doc.status === "draft");
  return docs;
}

function isStarterDraftDoc(doc: any): boolean {
  if (doc.status !== "draft" || doc.importSourcePath || doc.importProfile) return false;
  const normalizedPath = String(doc.filePath || "").replace(/\\/g, "/").toLowerCase();
  return [
    "overview.md",
    "architecture.md",
    "decisions.md",
    "tasks.md",
    "gotchas.md",
    "commands.md",
    "glossary.md",
    "privacy.md"
  ].some((name) => normalizedPath.endsWith(`/${name}`) || normalizedPath.endsWith(name));
}

function reviewModeLabel(mode: string): string {
  if (mode === "all") return "All updates require review";
  if (mode === "risky-only") return "Only risky updates";
  return "Off - direct writes";
}

function ConfirmDeleteButton({
  itemType,
  title,
  label,
  critical,
  permanent,
  disabled,
  onConfirm
}: {
  itemType: string;
  title: string;
  label: string;
  critical?: boolean;
  permanent?: boolean;
  disabled?: boolean;
  onConfirm: () => Promise<unknown> | unknown;
}) {
  const [open, setOpen] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const preferenceKey = `aimem.delete.confirm.skip.${itemType}`;
  const actionText = permanent ? "permanently delete" : "move to trash";

  async function runDelete() {
    await onConfirm();
  }

  async function handleClick() {
    if (disabled) return;
    if (localStorage.getItem(preferenceKey) === "true") {
      await runDelete();
      return;
    }
    setOpen(true);
  }

  async function confirm() {
    if (dontAskAgain) localStorage.setItem(preferenceKey, "true");
    setOpen(false);
    setDontAskAgain(false);
    await runDelete();
  }

  return (
    <>
      <button type="button" className={permanent ? "danger-button" : undefined} disabled={disabled} onClick={() => void handleClick()}>
        {label}
      </button>
      {open ? (
        <div className="dialog-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-label={`Confirm ${label}`}>
            <h3>{permanent ? "Delete Permanently?" : critical ? "Move Critical Item to Trash?" : "Move to Trash?"}</h3>
            <p>
              This will {actionText} <strong>{title}</strong>.
              {permanent ? " This cannot be undone." : " You can restore it later from Trash."}
            </p>
            <label className="checkbox-row">
              <input type="checkbox" checked={dontAskAgain} onChange={(event) => setDontAskAgain(event.target.checked)} />
              <span>Do not ask again for this type of item</span>
            </label>
            <div className="button-row">
              <button type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className={permanent ? "danger-button" : undefined} onClick={() => void confirm()}>
                {label}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DirectoryField({ value, onChange, placeholder, required }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  const [pickerAvailable, setPickerAvailable] = useState(false);

  useEffect(() => {
    setPickerAvailable(canPickDirectory());
  }, []);

  async function chooseDirectory() {
    const selected = await pickDirectory();
    if (selected) onChange(selected);
  }

  return (
    <div>
      <div className="path-input-row">
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} />
        <button
          type="button"
          disabled={!pickerAvailable}
          onClick={() => void chooseDirectory()}
          title={pickerAvailable ? "Choose folder" : "Open the Tauri desktop app to browse folders"}
        >
          Browse
        </button>
      </div>
      {!pickerAvailable ? (
        <p className="field-help">Browser mode cannot browse arbitrary local folders. Paste or type the absolute path, or use the desktop app for folder picking.</p>
      ) : null}
    </div>
  );
}

function splitList(input: string): string[] {
  return input.split(",").map((item) => item.trim()).filter(Boolean);
}
