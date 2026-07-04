import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { Empty, KeyValue, Panel, Screen } from "../components/layout.js";
import { WorkTabs } from "../components/SectionTabs.js";

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
