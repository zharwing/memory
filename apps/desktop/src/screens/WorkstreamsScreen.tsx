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
import {
  ErrorSummary,
  TextAreaField,
  TextField,
  type FormError
} from "../components/FormField.js";
import { useAsyncAction } from "../utils/useAsyncAction.js";
import { useDraft } from "../hooks/useDraft.js";
import { useCloseWhenMissing, useRouteQueryParam } from "../hooks/useSearchParamState.js";

interface WorkstreamDraft {
  name: string;
  summary: string;
  goal: string;
  topics: string;
  repoRoles: string;
  relatedTasks: string;
  relatedFiles: string;
}

const WORKSTREAM_DRAFT_DEFAULTS: WorkstreamDraft = {
  name: "",
  summary: "",
  goal: "",
  topics: "",
  repoRoles: "",
  relatedTasks: "",
  relatedFiles: ""
};

export const WorkstreamsScreen = observer(function WorkstreamsScreen() {
  const store = useStore();
  const [routeWorkstreamId, setRouteWorkstreamId] = useRouteQueryParam("workstreams", "workstream");
  const [draft, patchDraft, setDraft] = useDraft<WorkstreamDraft>(WORKSTREAM_DRAFT_DEFAULTS);
  const [formErrors, setFormErrors] = useState<FormError[]>([]);
  const submit = useAsyncAction();
  const { name, summary, goal, topics, repoRoles, relatedTasks, relatedFiles } = draft;

  useEffect(() => {
    if (store.projects.selectedProjectId) void store.workstreams.load();
  }, [store, store.projects.selectedProjectId]);

  useEffect(() => {
    if (
      routeWorkstreamId &&
      routeWorkstreamId !== store.workstreams.selectedWorkstreamId &&
      store.workstreams.list.some((workstream) => workstream.id === routeWorkstreamId)
    ) {
      void store.workstreams.selectWorkstream(routeWorkstreamId);
    }
  }, [routeWorkstreamId, store, store.workstreams.list, store.workstreams.selectedWorkstreamId]);

  const detail = store.workstreams.detail;
  const listState = store.workstreams.listState;
  useCloseWhenMissing(
    routeWorkstreamId,
    (listState.status === "success" || listState.status === "empty") &&
      !store.workstreams.list.some((workstream) => workstream.id === routeWorkstreamId),
    () => setRouteWorkstreamId(null, { replace: true })
  );
  const repoCategoryOptions = [...new Set(store.projects.repoLinks.map((repo) => repo.role).filter(Boolean))].sort();
  const selectedRepoCategories = splitList(repoRoles);
  function toggleRepoCategory(category: string) {
    const next = selectedRepoCategories.includes(category)
      ? selectedRepoCategories.filter((item) => item !== category)
      : [...selectedRepoCategories, category];
    patchDraft({ repoRoles: next.join(", ") });
  }

  return (
    <Screen title="Workstreams" actions={<button type="button" disabled={!store.projects.selectedProjectId} onClick={() => store.workstreams.load()}>Refresh</button>}>
      <WorkTabs />
      <div className="dashboard-grid">
        <Panel title="Create Workstream">
          <form className="stacked-form" aria-busy={submit.pending} onSubmit={(event) => {
            event.preventDefault();
            const errors: FormError[] = [];
            if (!name.trim()) errors.push({ id: "workstream-name", message: "Enter a workstream name." });
            setFormErrors(errors);
            if (errors.length || submit.pending) return;
            const previousCount = store.workstreams.list.length;
            void submit.run(async () => {
              await store.workstreams.createWorkstream({
                name,
                summary,
                goal,
                topics: splitList(topics),
                repoRoles: splitList(repoRoles),
                relatedTasks: splitList(relatedTasks),
                relatedFiles: splitList(relatedFiles)
              });
              if (store.workstreams.list.length > previousCount) {
                setDraft(WORKSTREAM_DRAFT_DEFAULTS);
              }
            });
          }}>
            <ErrorSummary errors={formErrors} />
            <TextField
              label="Name"
              id="workstream-name"
              value={name}
              onChange={(event) => { patchDraft({ name: event.target.value }); setFormErrors([]); }}
              placeholder="Dashboard testing"
              autoComplete="off"
              error={formErrors.length ? "Enter a workstream name." : undefined}
              required
            />
            <TextAreaField label="Description" value={summary} onChange={(event) => patchDraft({ summary: event.target.value })} placeholder="What kind of work belongs here?" rows={3} />
            <details className="advanced-fields">
              <summary>Advanced details</summary>
              <div className="advanced-fields-body">
                <TextAreaField label="Target outcome" value={goal} onChange={(event) => patchDraft({ goal: event.target.value })} placeholder="What this workstream is trying to finish" rows={3} />
                <TextField label="Tags" value={topics} onChange={(event) => patchDraft({ topics: event.target.value })} placeholder="dashboard, testing, memory" help="Optional. The workstream name is already used as a tag." />
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
                  <input value={repoRoles} onChange={(event) => patchDraft({ repoRoles: event.target.value })} placeholder={repoCategoryOptions.length ? "additional categories" : "app, backend"} />
                  <p className="field-help">Optional. Select known repo categories or type extras separated by commas.</p>
                </label>
                <TextField label="Related tasks" value={relatedTasks} onChange={(event) => patchDraft({ relatedTasks: event.target.value })} placeholder="task ids or labels" />
                <TextField label="Related files" value={relatedFiles} onChange={(event) => patchDraft({ relatedFiles: event.target.value })} placeholder="paths this workstream often touches" />
              </div>
            </details>
            <button type="submit" disabled={!store.projects.selectedProjectId || submit.pending} aria-busy={submit.pending}>{submit.pending ? "Creating…" : "Create Workstream"}</button>
          </form>
        </Panel>
        <Panel title="Workstream List">
          {listState.status === "idle" || listState.status === "loading" ? (
            <p className="panel-help" role="status">Loading workstreams...</p>
          ) : store.workstreams.list.length ? (
            <div className="repo-list">
              {store.workstreams.list.map((workstream) => (
                <button
                  type="button"
                  className={`project-card compact ${store.workstreams.selectedWorkstreamId === workstream.id ? "selected" : ""}`}
                  aria-pressed={store.workstreams.selectedWorkstreamId === workstream.id}
                  key={workstream.id}
                  onClick={() => {
                    setRouteWorkstreamId(workstream.id);
                    void store.workstreams.selectWorkstream(workstream.id);
                  }}
                >
                  <strong>{workstream.name}</strong>
                  <span>{workstream.status}</span>
                  <small>{workstream.topics?.join(", ") || workstream.slug}</small>
                </button>
              ))}
            </div>
          ) : listState.status === "empty" ? (
            <Empty text="No workstreams yet. Create one for a multi-day topic like Huddle." />
          ) : null}
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
            <WorkstreamStatusActions
              workstream={detail.workstream}
              onStatusChange={(workstreamId, status) => store.workstreams.updateStatus(workstreamId, status)}
            />
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
