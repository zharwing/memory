import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { Empty, Screen } from "../components/layout.js";
import { WorkTabs } from "../components/SectionTabs.js";
import { DataTable } from "../components/DataTable.js";
import { SessionDetailModal } from "../components/SessionDetailModal.js";
import { useCloseWhenMissing, useSearchParamState } from "../hooks/useSearchParamState.js";
import { timestampRenderers } from "../utils/format.js";
import { isStaleActiveSession } from "../utils/sessions.js";

export const SessionsScreen = observer(function SessionsScreen() {
  const store = useStore();
  const [selectedSessionId, setSessionSearchParam] = useSearchParamState("session");
  const selectedSession = store.sessions.find((session) => session.id === selectedSessionId);
  const staleSessions = store.sessions.filter(isStaleActiveSession);

  useCloseWhenMissing(
    selectedSessionId,
    store.sessions.length > 0 && !store.sessions.some((session) => session.id === selectedSessionId),
    () => closeSessionDetail(true)
  );

  useEffect(() => {
    if (selectedSession && selectedSession.body === undefined) {
      void store.loadSessionDetail(selectedSession.id);
    }
  }, [selectedSession?.id, selectedSession?.body, store]);

  function openSessionDetail(session: { id: string }) {
    setSessionSearchParam(session.id);
  }

  function closeSessionDetail(replace = false) {
    setSessionSearchParam(null, { replace });
  }

  return (
    <Screen title="Sessions for this project">
      <WorkTabs />
      {staleSessions.length ? (
        <div className="notice stale-sessions-notice">
          <div>
            <strong>
              {staleSessions.length} session{staleSessions.length === 1 ? " is" : "s are"} still open from an earlier day
            </strong>
            <p>
              Agents that exit without closing leave their session active. Closing them records a
              summary and keeps the history tidy; this also happens automatically the next time a
              session starts.
            </p>
          </div>
          <button
            type="button"
            className="icon-text-button primary"
            disabled={store.loading}
            onClick={() => void store.closeStaleSessions()}
          >
            Close {staleSessions.length === 1 ? "it" : "them all"}
          </button>
        </div>
      ) : null}
      <div className="table-toolbar">
        <span className="panel-help">Select a session to read its work log.</span>
        <div className="row-actions">
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
      {store.sessions.length ? (
        <DataTable
          columns={["updated", "status", "agent", "branch", "taskTitle"]}
          columnLabels={{ updated: "Updated", status: "Status", agent: "Agent", branch: "Branch", taskTitle: "Task" }}
          rows={store.sessions}
          renderers={timestampRenderers("updated")}
          selectedRowId={selectedSessionId}
          onRowClick={openSessionDetail}
          rowActions={(session) => (
            <>
              <button type="button" onClick={() => openSessionDetail(session)}>
                Open
              </button>
              {session.status === "active" ? (
                <button
                  type="button"
                  disabled={store.loading}
                  onClick={() => void store.closeSession(session.id)}
                >
                  Close session
                </button>
              ) : null}
            </>
          )}
        />
      ) : (
        <Empty text="No sessions recorded yet." />
      )}
      {selectedSession ? (
        <SessionDetailModal
          session={selectedSession}
          onClose={() => closeSessionDetail()}
          onDeleted={() => closeSessionDetail(true)}
        />
      ) : null}
    </Screen>
  );
});
