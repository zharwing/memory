import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { Empty, Screen } from "../components/layout.js";
import { WorkTabs } from "../components/SectionTabs.js";
import { SessionCloseoutDialog } from "../components/SessionDetailModal.js";
import { formatShortDateTime } from "../utils/format.js";

export const CurrentWorkScreen = observer(function CurrentWorkScreen() {
  const store = useStore();
  const active = store.sessions.list.find((session) => session.status === "active");
  const [checkpoint, setCheckpoint] = useState("");
  const [closeoutOpen, setCloseoutOpen] = useState(false);

  if (!active) {
    return (
      <Screen title="Current Work">
        <WorkTabs />
        <Empty text="No active session. Start or resume from the dashboard." />
      </Screen>
    );
  }

  function saveCheckpoint() {
    if (!active || !checkpoint.trim()) return;
    void store.sessions.saveCheckpoint(active.id, checkpoint.trim()).then(() => setCheckpoint(""));
  }

  return (
    <Screen title="Current Work">
      <WorkTabs />
      <section className="panel work-card">
        <div className="work-card-heading">
          <h3>{active.taskTitle}</h3>
          <span className="session-status-badge is-active">Active</span>
        </div>
        {/* Human-readable, with the exact stored timestamp on hover. */}
        <p className="work-meta">
          <span title={active.started}>Started {formatShortDateTime(active.started)}</span>
          <span aria-hidden="true">•</span>
          <span title={active.updated}>Updated {formatShortDateTime(active.updated)}</span>
        </p>

        <div className="checkpoint-section">
          <label className="checkpoint-label" htmlFor="checkpoint-summary">Add a checkpoint</label>
          <form
            className="checkpoint-form"
            onSubmit={(event) => {
              event.preventDefault();
              saveCheckpoint();
            }}
          >
            <input
              id="checkpoint-summary"
              value={checkpoint}
              onChange={(event) => setCheckpoint(event.target.value)}
              placeholder="Summarize progress, decisions, or next steps…"
            />
            <button
              type="submit"
              className="icon-text-button primary"
              disabled={store.sessions.loading || !checkpoint.trim()}
            >
              Save checkpoint
            </button>
          </form>
        </div>

        {/* Infrequent and consequential, so it stays quieter than the routine
            action and keeps its optional summary hidden until it is wanted. */}
        <footer className="work-card-footer">
          <button
            type="button"
            className="icon-text-button"
            disabled={store.sessions.loading}
            onClick={() => setCloseoutOpen(true)}
          >
            Close work log
          </button>
        </footer>
      </section>
      {closeoutOpen ? (
        <SessionCloseoutDialog
          session={active}
          title="Close this work log?"
          confirmLabel="Close work log"
          onCancel={() => setCloseoutOpen(false)}
        />
      ) : null}
    </Screen>
  );
});
