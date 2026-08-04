import { useState } from "react";
import { observer } from "mobx-react-lite";
import { NavLink } from "react-router-dom";
import { useStore } from "../stores/store-context.js";
import { KeyValue, Panel, Screen } from "../components/layout.js";
import { DataTable } from "../components/DataTable.js";
import { reviewModeLabel } from "../utils/labels.js";
import { projectPath } from "../utils/routes.js";
import { pendingInboxReviewCount } from "../utils/inbox.js";
import { timestampRenderers } from "../utils/format.js";

export const DashboardScreen = observer(function DashboardScreen() {
  const store = useStore();
  const summary = store.projects.summary;
  const memoryWritePolicy = store.projects.selectedMemoryWritePolicy;
  const pendingReviewCount = pendingInboxReviewCount(store.inbox.items);
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
          <KeyValue label="Safety" value={store.assistant.contextBundle?.safetyStatus || "unknown"} />
          <KeyValue label="Would include" value={store.assistant.contextBundle?.includedItems?.length || 0} />
          <KeyValue label="Would skip" value={store.assistant.contextBundle?.excludedItems?.length || 0} />
          <KeyValue label="Estimated tokens" value={store.assistant.contextBundle?.tokenEstimate || 0} />
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
          <KeyValue label="Nodes" value={store.graph.data?.nodes?.length || 0} />
          <KeyValue label="Edges" value={store.graph.data?.edges?.length || 0} />
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
  return (
    <form className="inline-form compact" onSubmit={(event) => {
      event.preventDefault();
      void store.sessions.startSession(task, workstreamId ? [workstreamId] : []).then(() => setTask(""));
    }}>
      <input value={task} onChange={(event) => setTask(event.target.value)} placeholder="Optional session title" />
      <select value={workstreamId} onChange={(event) => setWorkstreamId(event.target.value)}>
        <option value="">No workstream</option>
        {store.workstreams.list.map((workstream) => (
          <option key={workstream.id} value={workstream.id}>{workstream.name}</option>
        ))}
      </select>
      <NavLink className="button-link" to={projectPath(store.projects.selectedProjectId, "/workstreams")}>Create Workstream</NavLink>
      <button type="submit">Start Today's Session</button>
      <button type="button" onClick={() => store.refreshAll()}>Refresh</button>
    </form>
  );
}

function RecentSessions() {
  const store = useStore();
  return (
    <Panel title="Recent Project Sessions">
      <DataTable
        columns={["updated", "status", "taskTitle"]}
        columnLabels={{ updated: "Updated", status: "Status", taskTitle: "Task" }}
        rows={store.sessions.list.slice(0, 6)}
        renderers={timestampRenderers("updated")}
      />
    </Panel>
  );
}
