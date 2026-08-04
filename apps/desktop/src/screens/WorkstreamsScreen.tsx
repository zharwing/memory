import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { Empty, KeyValue, Panel, RawTextPreview, Screen } from "../components/layout.js";
import { WorkTabs } from "../components/SectionTabs.js";
import { DataTable } from "../components/DataTable.js";
import { ConfirmDeleteButton } from "../components/ConfirmDeleteButton.js";
import { ToggleGroup } from "../components/ToggleGroup.js";
import { WorkstreamStatusActions } from "../components/WorkstreamStatusActions.js";
import { formatShortDateTime, splitList, timestampRenderers } from "../utils/format.js";

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
    if (store.projects.selectedProjectId) void store.workstreams.load();
  }, [store, store.projects.selectedProjectId]);

  const detail = store.workstreams.detail;
  const repoCategoryOptions = [...new Set(store.projects.repoLinks.map((repo) => repo.role).filter(Boolean))].sort();
  const selectedRepoCategories = splitList(repoRoles);
  function toggleRepoCategory(category: string) {
    const next = selectedRepoCategories.includes(category)
      ? selectedRepoCategories.filter((item) => item !== category)
      : [...selectedRepoCategories, category];
    setRepoRoles(next.join(", "));
  }

  return (
    <Screen title="Workstreams" actions={<button disabled={!store.projects.selectedProjectId} onClick={() => store.workstreams.load()}>Refresh</button>}>
      <WorkTabs />
      <div className="dashboard-grid">
        <Panel title="Create Workstream">
          <form className="stacked-form" onSubmit={(event) => {
            event.preventDefault();
            void store.workstreams.createWorkstream({
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
                    <ToggleGroup
                      className="option-chips"
                      ariaLabel="Repo categories"
                      value={selectedRepoCategories}
                      onChange={toggleRepoCategory}
                      options={repoCategoryOptions.map((category) => ({ value: category, label: category }))}
                    />
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
            <button type="submit" disabled={!store.projects.selectedProjectId}>Create Workstream</button>
          </form>
        </Panel>
        <Panel title="Workstream List">
          {store.workstreams.list.length ? (
            <div className="repo-list">
              {store.workstreams.list.map((workstream) => (
                <button
                  type="button"
                  className={`project-card compact ${store.workstreams.selectedWorkstreamId === workstream.id ? "selected" : ""}`}
                  key={workstream.id}
                  onClick={() => store.workstreams.selectWorkstream(workstream.id)}
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
            <KeyValue label="Updated" value={formatShortDateTime(detail.workstream.updated)} />
            <KeyValue label="File" value={detail.workstream.filePath || "not written"} />
          </div>
          <div className="button-row">
            <WorkstreamStatusActions workstream={detail.workstream} />
            <ConfirmDeleteButton
              itemType="workstream"
              title={detail.workstream.name}
              label="Move to Trash"
              onConfirm={() => store.workstreams.deleteWorkstream(detail.workstream.id)}
            />
          </div>
          <RawTextPreview text={detail.workstream.body} />
          <h3>Related Sessions</h3>
          <DataTable
            columns={["updated", "status", "agent", "taskTitle"]}
            columnLabels={{ updated: "Updated", status: "Status", agent: "Agent", taskTitle: "Task" }}
            rows={detail.sessions || []}
            renderers={timestampRenderers("updated")}
          />
          <h3>Related Docs</h3>
          <DataTable
            columns={["updated", "status", "visibility", "type", "title"]}
            rows={detail.documents || []}
            renderers={timestampRenderers("updated")}
          />
        </Panel>
      ) : null}
    </Screen>
  );
});
