import { useState } from "react";
import { observer } from "mobx-react-lite";
import { NavLink } from "react-router-dom";
import { useStore } from "../stores/store-context.js";
import {
  FormErrorSummary,
  OperationRecovery
} from "../app/recovery/index.js";
import { KeyValue, Panel, Screen } from "../components/layout.js";
import { DataTable } from "../components/DataTable.js";
import { ResourceAsyncRegion } from "../components/AccessibleStatus.js";
import { reviewModeLabel } from "../utils/labels.js";
import { routePath } from "../utils/routes.js";
import { pendingInboxReviewCount } from "../utils/inbox.js";
import { timestampRenderers } from "../utils/format.js";

export const DashboardScreen = observer(function DashboardScreen() {
  const store = useStore();
  const summaryState = store.projects.summaryState;
  const memoryWritePolicy = store.projects.selectedMemoryWritePolicy;
  const pendingReviewCount = pendingInboxReviewCount(store.inbox.items);
  return (
    <Screen title="Project Dashboard" actions={<DashboardActions />}>
      <div className="dashboard-grid">
        <Panel title="Current Work">
          <ResourceAsyncRegion
            state={summaryState}
            label="Project summary"
            loading={<p className="panel-help" role="status">Loading project summary…</p>}
            error={<p className="panel-help" role="alert">The project summary could not be loaded. Refresh to try again.</p>}
            retainedStatus={{
              refreshing: <p className="panel-help" role="status">Refreshing summary; showing the last accepted result.</p>,
              partial: <p className="panel-help" role="status">Showing a partial project summary.</p>
            }}
          >
            {(summary) => (
              <>
                <KeyValue label="Active session" value={summary?.activeSession?.taskTitle || "None"} />
                <KeyValue label="Latest session" value={summary?.latestSession?.taskTitle || "None"} />
                <KeyValue label="Pending next steps" value={summary?.latestSession?.nextSteps?.length || 0} />
              </>
            )}
          </ResourceAsyncRegion>
        </Panel>
        <Panel title="Context Preview">
          <p className="panel-help">Preview only. These items are not sent anywhere unless an agent or user asks for a context bundle.</p>
          <ResourceAsyncRegion
            state={store.assistant.contextBundleResource.state}
            label="Context preview"
            loading={<p className="panel-help" role="status">Loading context preview…</p>}
            error={<p className="panel-help" role="alert">The context preview could not be loaded. Refresh to try again.</p>}
            retainedStatus={{
              refreshing: <p className="panel-help" role="status">Refreshing context preview; showing the last accepted result.</p>,
              partial: <p className="panel-help" role="status">Showing a partial context preview.</p>
            }}
          >
            {(contextBundle) => (
              <>
                <KeyValue label="Safety" value={contextBundle?.safetyStatus || "unknown"} />
                <KeyValue label="Would include" value={contextBundle?.includedItems?.length || 0} />
                <KeyValue label="Would skip" value={contextBundle?.excludedItems?.length || 0} />
                <KeyValue label="Estimated tokens" value={contextBundle?.tokenEstimate || 0} />
              </>
            )}
          </ResourceAsyncRegion>
        </Panel>
        <Panel title="Memory Updates">
          <p className="panel-help">
            Agents can write normal session logs and project memory directly. The inbox is only used when review mode is enabled or an update needs attention.
          </p>
          <KeyValue label="Review mode" value={reviewModeLabel(memoryWritePolicy.reviewMode)} />
          <KeyValue label="Direct agent writes" value={memoryWritePolicy.allowAgentDirectWrites ? "Allowed" : "Disabled"} />
          <KeyValue label="Pending review" value={pendingReviewCount} />
        </Panel>
        <Panel title="Graph Snapshot">
          <ResourceAsyncRegion
            state={store.graph.graphResource.state}
            label="Graph snapshot"
            loading={<p className="panel-help" role="status">Loading graph snapshot…</p>}
            empty={(
              <>
                <KeyValue label="Nodes" value={0} />
                <KeyValue label="Edges" value={0} />
              </>
            )}
            error={<p className="panel-help" role="alert">The graph snapshot could not be loaded. Refresh to try again.</p>}
            retainedStatus={{
              refreshing: <p className="panel-help" role="status">Refreshing graph; showing the last accepted result.</p>,
              partial: <p className="panel-help" role="status">Showing a partial graph snapshot.</p>
            }}
          >
            {(graph) => (
              <>
                <KeyValue label="Nodes" value={graph?.nodes?.length || 0} />
                <KeyValue label="Edges" value={graph?.edges?.length || 0} />
              </>
            )}
          </ResourceAsyncRegion>
        </Panel>
      </div>
      <RecentSessions />
    </Screen>
  );
});

function DashboardActions() {
  const store = useStore();
  const [task, setTask] = useState("");
  const [workstreamId, setWorkstreamId] = useState("");
  const startState = store.sessions.operationState("session:start");
  const formError = startState.status === "failed" || startState.status === "refused"
    ? startState.error
    : undefined;

  async function startSession() {
    await store.sessions.startSession(task, workstreamId ? [workstreamId] : []);
    if (store.sessions.operationState("session:start").status === "succeeded") setTask("");
  }

  return (
    <div className="operation-form-boundary">
      <form className="inline-form compact" onSubmit={(event) => {
        event.preventDefault();
        void startSession();
      }}>
        <FormErrorSummary
          error={formError}
          fieldLabels={{ taskTitle: "Session title", workstreamIds: "Workstream" }}
          onFocusField={(field) => {
            const target = document.getElementById(field === "workstreamIds" ? "dashboard-workstream" : "dashboard-session-title");
            if (target instanceof HTMLElement) target.focus();
          }}
        />
        <input
          id="dashboard-session-title"
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder="Optional session title"
        />
        <select
          id="dashboard-workstream"
          value={workstreamId}
          onChange={(event) => setWorkstreamId(event.target.value)}
        >
          <option value="">No workstream</option>
          {store.workstreams.list.map((workstream) => (
            <option key={workstream.id} value={workstream.id}>{workstream.name}</option>
          ))}
        </select>
        <NavLink className="button-link" to={routePath("workstreams", { projectId: store.projects.selectedProjectId })}>Create Workstream</NavLink>
        <button
          id="dashboard-start-session"
          type="submit"
          disabled={startState.status === "submitting" || startState.status === "reconciling"}
        >
          Start Today&apos;s Session
        </button>
        <button type="button" onClick={() => store.refreshAll()}>Refresh</button>
      </form>
      <OperationRecovery
        state={startState}
        onRetry={startSession}
        onReconcile={() => store.recover()}
        onReviewInput={() => document.getElementById("dashboard-session-title")?.focus()}
        onRecoveredFocus={() => document.getElementById("dashboard-start-session")?.focus()}
      />
    </div>
  );
}

function RecentSessions() {
  const store = useStore();
  const listState = store.sessions.listState;
  return (
    <Panel title="Recent Project Sessions">
      <ResourceAsyncRegion
        state={listState}
        label="Recent project sessions"
        loading={<p className="panel-help" role="status">Loading recent sessions…</p>}
        empty={<p className="panel-help">No project sessions yet.</p>}
        error={<p className="panel-help" role="alert">Recent sessions could not be loaded. Refresh to try again.</p>}
        retainedStatus={{
          refreshing: <p className="panel-help" role="status">Refreshing sessions; showing the last accepted result.</p>,
          partial: <p className="panel-help" role="status">Showing recent sessions from a partial list.</p>
        }}
      >
        {(sessions) => (
          <>
            {sessions.length ? (
              <DataTable
                columns={["updated", "status", "taskTitle"]}
                columnLabels={{ updated: "Updated", status: "Status", taskTitle: "Task" }}
                rows={sessions.slice(0, 6)}
                renderers={timestampRenderers("updated")}
              />
            ) : null}
          </>
        )}
      </ResourceAsyncRegion>
    </Panel>
  );
}
