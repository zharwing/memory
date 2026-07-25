import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { Empty, KeyValue, Panel, Screen } from "../components/layout.js";
import { WorkTabs } from "../components/SectionTabs.js";
import { DataTable } from "../components/DataTable.js";
import { ConfirmDeleteButton } from "../components/ConfirmDeleteButton.js";

export const SessionsScreen = observer(function SessionsScreen() {
  const store = useStore();
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const selectedSession = store.sessions.find((session) => session.id === selectedSessionId) || store.sessions[0];
  useEffect(() => {
    if (selectedSession && selectedSession.body === undefined) {
      void store.loadSessionDetail(selectedSession.id);
    }
  }, [selectedSession?.id, selectedSession?.body, store]);
  return (
    <Screen title="Sessions for this project">
      <WorkTabs />
      <DataTable
        columns={["updated", "status", "agent", "branch", "taskTitle"]}
        columnLabels={{ updated: "Updated", status: "Status", agent: "Agent", branch: "Branch", taskTitle: "Task" }}
        rows={store.sessions}
      />
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
          <div className="session-summary-panel">
            <div className="semantic-graph-mini-stats">
              <KeyValue label="TLDR source" value={selectedSession.summarySource || "Not generated"} />
              <KeyValue label="Generated" value={selectedSession.summaryGeneratedAt || "Never"} />
              <KeyValue label="Topics" value={selectedSession.topics?.join(", ") || "None"} />
              <KeyValue label="Graph" value={selectedSession.includeInGraph ? "Included" : "Not included"} />
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(selectedSession.includeInGraph)}
                disabled={store.loading}
                onChange={(event) =>
                  void store.updateSessionGraphVisibility(selectedSession.id, event.target.checked)
                }
              />
              <span>Include in graph</span>
            </label>
            <p className="panel-help">
              Keep this off for routine history. Turn it on only when the session is important enough to appear in the project graph.
            </p>
            <p>{selectedSession.summary || "No searchable session TLDR has been generated yet."}</p>
            <div className="button-row">
              <button
                type="button"
                className="icon-text-button"
                disabled={store.loading}
                onClick={() => void store.generateSessionSummary(selectedSession.id, true)}
              >
                Generate TLDR
              </button>
              <button
                type="button"
                className="icon-text-button"
                disabled={store.loading}
                onClick={() => void store.generateSessionSummaries("missing")}
              >
                Summarize missing
              </button>
              <details className="advanced-fields session-summary-advanced">
                <summary>Advanced</summary>
                <div className="advanced-fields-body">
                  <button
                    type="button"
                    className="danger-button"
                    disabled={store.loading}
                    onClick={() => void store.generateSessionSummaries("all")}
                  >
                    Regenerate all summaries
                  </button>
                </div>
              </details>
            </div>
          </div>
          <pre className="markdown-preview">
            {selectedSession.body === undefined ? "Loading session body…" : selectedSession.body || "No session body recorded."}
          </pre>
        </Panel>
      ) : (
        <Empty text="No sessions recorded yet." />
      )}
    </Screen>
  );
});
