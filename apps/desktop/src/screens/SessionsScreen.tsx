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
  const selectedSession = store.sessions.list.find((session) => session.id === selectedSessionId);
  const staleSessions = store.sessions.list.filter(isStaleActiveSession);
  const listState = store.sessions.listState;
  const completeness = store.sessions.listCompleteness;
  const initialLoading = listState.status === "idle" || listState.status === "loading";
  const canShowMore = completeness?.kind === "partial" && store.sessions.requestedLimit < 200;
  const cappedPartial = completeness?.kind === "partial" && store.sessions.requestedLimit >= 200;

  useCloseWhenMissing(
    selectedSessionId,
    store.sessions.list.length > 0 && !store.sessions.list.some((session) => session.id === selectedSessionId),
    () => closeSessionDetail(true)
  );

  useEffect(() => {
    if (selectedSession && selectedSession.body === undefined) {
      void store.sessions.loadDetail(selectedSession.id);
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
            disabled={store.sessions.loading}
            onClick={() => void store.sessions.closeStaleSessions()}
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
            disabled={store.sessions.loading}
            onClick={() => void store.sessions.generateSummaries("missing")}
          >
            Summarize missing
          </button>
          <details className="advanced-fields session-summary-advanced">
            <summary>Advanced</summary>
            <div className="advanced-fields-body">
              <button
                type="button"
                className="danger-button"
                disabled={store.sessions.loading}
                onClick={() => void store.sessions.generateSummaries("all")}
              >
                Regenerate all summaries
              </button>
            </div>
          </details>
        </div>
      </div>
      {initialLoading ? (
        <p className="panel-help" role="status">Loading sessions...</p>
      ) : store.sessions.list.length ? (
        <DataTable
          columns={["updated", "status", "agent", "branch", "taskTitle"]}
          columnLabels={{ updated: "Updated", status: "Status", agent: "Agent", branch: "Branch", taskTitle: "Task" }}
          rows={store.sessions.list}
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
                  disabled={store.sessions.loading}
                  onClick={() => void store.sessions.closeSession(session.id)}
                >
                  Close session
                </button>
              ) : null}
            </>
          )}
        />
      ) : listState.status === "empty" ? (
        <Empty text="No sessions recorded yet." />
      ) : null}
      {canShowMore ? (
        <div className="table-toolbar">
          <span className="panel-help">This is a partial session history.</span>
          <button type="button" disabled={store.sessions.loading} onClick={() => void store.sessions.loadMore()}>
            Show more
          </button>
        </div>
      ) : null}
      {cappedPartial ? (
        <p className="panel-help" role="status">
          Showing the first 200 sessions. More sessions may exist.
        </p>
      ) : null}
      {selectedSession ? (
        <SessionDetailModal
          session={selectedSession}
          sessions={store.sessions}
          onClose={() => closeSessionDetail()}
          onDeleted={() => closeSessionDetail(true)}
        />
      ) : null}
    </Screen>
  );
});
