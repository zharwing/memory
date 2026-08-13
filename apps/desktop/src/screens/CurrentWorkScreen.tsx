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
  const listState = store.sessions.listState;
  const listCompleteness = store.sessions.listCompleteness;
  const [checkpoint, setCheckpoint] = useState("");
  const [closeoutOpen, setCloseoutOpen] = useState(false);

  if (!active) {
    return (
      <Screen title="Current Work">
        <WorkTabs />
        {listState.status === "idle" || listState.status === "loading" ? (
          <p className="panel-help" role="status">Loading current work...</p>
        ) : listState.status === "refreshing" ? (
          <p className="panel-help" role="status">Refreshing current work...</p>
        ) : listState.status === "failure" ? (
          <p className="panel-help" role="alert">Current work could not be loaded. Refresh to try again.</p>
        ) : listCompleteness?.kind === "partial" ? (
          <p className="panel-help" role="status">
            No active session appears in this partial session list. More sessions may exist.
          </p>
        ) : listCompleteness?.kind === "complete" ? (
          <Empty text="No active session. Start or resume from the dashboard." />
        ) : (
          <p className="panel-help" role="status">Loading current work...</p>
        )}
      </Screen>
    );
  }

  async function saveCheckpoint() {
    if (!active || !checkpoint.trim()) return;
    const previousUpdated = active.updated;
    try {
      await store.sessions.saveCheckpoint(active.id, checkpoint.trim());
      const refreshed = store.sessions.list.find((session) => session.id === active.id);
      if (refreshed?.updated !== previousUpdated) setCheckpoint("");
    } catch {
      // The shared operation layer owns public failure copy; retain the draft.
    }
  }

  return (
    <Screen title="Current Work">
      <WorkTabs />
      {listState.status === "refreshing" ? (
        <p className="panel-help" role="status">Refreshing sessions; showing the last accepted result.</p>
      ) : listCompleteness?.kind === "partial" ? (
        <p className="panel-help" role="status">Showing a partial session list; older sessions may not be included.</p>
      ) : null}
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
              void saveCheckpoint();
            }}
          >
            <input
              id="checkpoint-summary"
              value={checkpoint}
              onChange={(event) => setCheckpoint(event.target.value)}
              autoComplete="off"
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
          sessions={store.sessions}
          title="Close this work log?"
          confirmLabel="Close work log"
          onCancel={() => setCloseoutOpen(false)}
        />
      ) : null}
    </Screen>
  );
});
