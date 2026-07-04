import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { Empty, Panel, Screen } from "../components/layout.js";
import { WorkTabs } from "../components/SectionTabs.js";
import { DataTable } from "../components/DataTable.js";
import { ConfirmDeleteButton } from "../components/ConfirmDeleteButton.js";

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
