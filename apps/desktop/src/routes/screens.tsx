import { FormEvent, ReactNode, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";

export const ProjectsScreen = observer(function ProjectsScreen() {
  const store = useStore();
  return (
    <Screen title="Projects" actions={<button onClick={() => store.loadProjects()}>Refresh</button>}>
      <div className="project-grid">
        {store.projects.map((project) => (
          <button className={`project-card ${store.selectedProjectId === project.id ? "selected" : ""}`} key={project.id} onClick={() => store.selectProject(project.id)}>
            <strong>{project.name}</strong>
            <span>{project.id}</span>
            <small>{project.memoryRoot}</small>
          </button>
        ))}
      </div>
      {store.projects.length === 0 ? <Empty text="No projects registered yet. Use `aimem init` or the MCP project creation flow." /> : null}
    </Screen>
  );
});

export const DashboardScreen = observer(function DashboardScreen() {
  const store = useStore();
  const summary = store.summary;
  return (
    <Screen title="Project Dashboard" actions={<DashboardActions />}>
      <div className="dashboard-grid">
        <Panel title="Current Work">
          <KeyValue label="Active session" value={summary?.activeSession?.taskTitle || "None"} />
          <KeyValue label="Latest session" value={summary?.latestSession?.taskTitle || "None"} />
          <KeyValue label="Pending next steps" value={summary?.latestSession?.nextSteps?.length || 0} />
        </Panel>
        <Panel title="AI Context Preview">
          <KeyValue label="Safety" value={store.contextBundle?.safetyStatus || "unknown"} />
          <KeyValue label="Included" value={store.contextBundle?.includedItems?.length || 0} />
          <KeyValue label="Excluded" value={store.contextBundle?.excludedItems?.length || 0} />
          <KeyValue label="Tokens" value={store.contextBundle?.tokenEstimate || 0} />
        </Panel>
        <Panel title="Memory Inbox">
          <KeyValue label="Pending" value={store.inbox.filter((item) => item.status === "pending").length} />
          <KeyValue label="Total" value={store.inbox.length} />
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
  return (
    <Screen title="Current Work">
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
  return (
    <Screen title="Docs Library">
      <DataTable columns={["updated", "status", "visibility", "type", "title"]} rows={store.docs} />
    </Screen>
  );
});

export const DiagramsScreen = observer(function DiagramsScreen() {
  const store = useStore();
  const diagrams = store.docs.filter((doc) => doc.type === "diagram");
  return (
    <Screen title="Diagrams">
      <DataTable columns={["updated", "status", "visibility", "title", "format"]} rows={diagrams} />
      {diagrams.length === 0 ? <Empty text="No diagrams yet. Mermaid diagram documents will appear here." /> : null}
    </Screen>
  );
});

export const GraphScreen = observer(function GraphScreen() {
  const store = useStore();
  return (
    <Screen title="Graph">
      <div className="graph-board">
        {(store.graph?.nodes || []).slice(0, 80).map((node: any) => (
          <div className={`graph-node ${node.type}`} key={node.id}>
            <strong>{node.label}</strong>
            <span>{node.type}</span>
          </div>
        ))}
      </div>
    </Screen>
  );
});

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
  return (
    <Screen title="Memory Inbox">
      <DataTable columns={["created", "status", "type", "confidence", "reason"]} rows={store.inbox} />
    </Screen>
  );
});

export const ContextScreen = observer(function ContextScreen() {
  const store = useStore();
  return (
    <Screen title="AI Context for This Session">
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

export function AssistantScreen() {
  return (
    <Screen title="Memory Assistant">
      <Panel title="Local Assistant">
        <p>The assistant runtime is optional. Core project memory, sessions, search, context preview, MCP, CLI, and backups work without a model.</p>
      </Panel>
    </Screen>
  );
}

export const BackupsScreen = observer(function BackupsScreen() {
  const store = useStore();
  return (
    <Screen title="Backups">
      <Panel title="Project Snapshot">
        <p>Snapshots copy project memory into `backups/snapshots` while excluding previous backups.</p>
        <button disabled={!store.selectedProjectId} onClick={() => store.client.call("memory.backup_project", { projectId: store.selectedProjectId })}>Create Snapshot</button>
      </Panel>
    </Screen>
  );
});

export const SettingsScreen = observer(function SettingsScreen() {
  const store = useStore();
  const project = store.selectedProject;
  return (
    <Screen title="Project Settings">
      <Panel title="Project">
        <KeyValue label="ID" value={project?.id || "None"} />
        <KeyValue label="Memory root" value={project?.memoryRoot || "None"} />
        <KeyValue label="Startup mode" value={project?.contextPolicy?.startupMode || "None"} />
        <KeyValue label="Assistant" value={project?.assistantPolicy?.runtimeType || "disabled"} />
      </Panel>
    </Screen>
  );
});

function DashboardActions() {
  const store = useStore();
  const [task, setTask] = useState("");
  return (
    <form className="inline-form compact" onSubmit={(event) => {
      event.preventDefault();
      if (task.trim()) void store.startSession(task.trim()).then(() => setTask(""));
    }}>
      <input value={task} onChange={(event) => setTask(event.target.value)} placeholder="New task title" />
      <button type="submit">Start Session</button>
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

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: any[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id || rowIndex}>
              {columns.map((column) => <td key={column}>{String(row[column] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
