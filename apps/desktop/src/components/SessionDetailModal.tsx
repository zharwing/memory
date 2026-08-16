import { type ReactNode, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { MoreHorizontal, X } from "lucide-react";
import type { Session, SessionSummary } from "@zharwing/memory-core";
import { Modal } from "./Modal.js";
import { AnchoredSurface } from "./AnchoredSurface.js";
import { ConfirmDeleteButton } from "./ConfirmDeleteButton.js";
import { MarkdownPreview } from "./markdown/MarkdownPreview.js";
import { formatShortDateTime } from "../utils/format.js";
import { IconButton } from "./IconButton.js";
import { StatusNotice } from "./AccessibleStatus.js";
import {
  executeSessionCloseout,
  type SessionCloseoutMutationPort,
  type SessionCloseoutOutcome
} from "./session-closeout.js";

const SUMMARY_CLAMP_CHARS = 260;

export type SessionReaderModel = Session | (SessionSummary & { body?: string });

export interface SessionDetailPort extends SessionCloseoutMutationPort {
  readonly loading: boolean;
  readonly error: string;
  generateSummary(sessionId: string, force?: boolean): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  updateGraphVisibility(
    sessionId: string,
    includeInGraph: boolean
  ): Promise<SessionCloseoutOutcome | undefined>;
}

/**
 * Session reader: the work log gets the dominant reading column, everything
 * supplemental (TL;DR, facts, graph opt-in) sits in a narrow inspector, and
 * closing a session is its own dialog rather than a permanent row of controls.
 * Only the reading column scrolls.
 */
export const SessionDetailModal = observer(function SessionDetailModal({
  session,
  sessions,
  onClose,
  onDeleted
}: {
  session: SessionReaderModel;
  sessions: SessionDetailPort;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const isActive = session.status === "active";
  const body = useMemo(
    () => stripLeadingSessionTitle(session.body, session.taskTitle),
    [session.body, session.taskTitle]
  );
  const summary = String(session.summary || "");
  const summaryIsLong = summary.length > SUMMARY_CLAMP_CHARS;
  const topics: string[] = session.topics || [];
  const clipboardAvailable = typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";

  function generateSummary() {
    void sessions.generateSummary(session.id, true);
  }

  return (
    <>
      <Modal
        ariaLabel={`Session ${session.taskTitle}`}
        backdropClassName="modal-backdrop"
        className="session-modal"
        onClose={onClose}
        closeOnEscape={!closeoutOpen}
        closeOnBackdropClick={!closeoutOpen}
      >
        <header className="session-reader-header">
          <div className="session-reader-heading">
            <span className={`session-status-badge ${isActive ? "is-active" : ""}`}>
              {isActive ? "Active" : "Closed"}
            </span>
            <h3 title={session.taskTitle}>{session.taskTitle}</h3>
            <p className="session-reader-subline">
              <span>{session.agent || "unknown agent"}</span>
              {session.branch ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="session-reader-branch" title={session.branch}>{session.branch}</span>
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <span>Updated {formatShortDateTime(session.updated)}</span>
            </p>
          </div>
          <div className="session-reader-actions">
            {isActive ? (
              <button
                type="button"
                className="icon-text-button primary"
                disabled={sessions.loading}
                onClick={() => setCloseoutOpen(true)}
              >
                Close session
              </button>
            ) : null}
            <OverflowMenu label="More session actions">
              {(closeMenu) => (
                <>
                  {!clipboardAvailable ? (
                    <p className="overflow-menu-help">Clipboard actions are unavailable in this environment.</p>
                  ) : null}
                  <button
                    type="button"
                    disabled={!clipboardAvailable}
                    title={clipboardAvailable ? undefined : "Clipboard access is unavailable in this environment"}
                    onClick={() => {
                      void navigator.clipboard?.writeText(window.location.href);
                      closeMenu();
                    }}
                  >
                    Copy session link
                  </button>
                  {session.branch ? (
                    <button
                      type="button"
                      disabled={!clipboardAvailable}
                      title={clipboardAvailable ? undefined : "Clipboard access is unavailable in this environment"}
                      onClick={() => {
                        void navigator.clipboard?.writeText(session.branch!);
                        closeMenu();
                      }}
                    >
                      Copy branch name
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={sessions.loading}
                    onClick={() => {
                      generateSummary();
                      closeMenu();
                    }}
                  >
                    {summary ? "Regenerate TL;DR" : "Generate TL;DR"}
                  </button>
                  <hr />
                  {/* Deliberately does not close the menu: this control owns a
                      confirmation dialog, and unmounting it would discard that. */}
                  <div className="overflow-menu-danger">
                    <ConfirmDeleteButton
                      itemType="session"
                      title={session.taskTitle}
                      critical={isActive}
                      label="Move to trash"
                      onConfirm={async () => {
                        await sessions.deleteSession(session.id);
                        (onDeleted || onClose)();
                      }}
                    />
                  </div>
                </>
              )}
            </OverflowMenu>
            <IconButton
              className="icon-only"
              onClick={onClose}
              label="Close session details"
            >
              <X size={16} aria-hidden="true" />
            </IconButton>
          </div>
        </header>

        <div className="session-reader-body">
          <section className="session-reader-main" aria-label="Session work log">
            {session.closedReason ? <p className="session-close-reason">{session.closedReason}</p> : null}
            {body === undefined ? (
              <div className="rendered-markdown empty-preview">Loading session body…</div>
            ) : body.trim() ? (
              <MarkdownPreview body={body} />
            ) : (
              <div className="rendered-markdown empty-preview">No session body recorded.</div>
            )}
          </section>

          <aside className="session-inspector">
            <section className="inspector-section">
              <div className="inspector-section-head">
                <h4>TL;DR</h4>
                {summary ? (
                  <button type="button" className="link-button" disabled={sessions.loading} onClick={generateSummary}>
                    Regenerate
                  </button>
                ) : null}
              </div>
              {summary ? (
                <>
                  <p className={`inspector-summary ${summaryExpanded ? "is-expanded" : ""}`}>{summary}</p>
                  {summaryIsLong ? (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setSummaryExpanded((open) => !open)}
                    >
                      {summaryExpanded ? "Show less" : "Show more"}
                    </button>
                  ) : null}
                  {session.summaryGeneratedAt ? (
                    <p className="inspector-caption">
                      {session.summarySource || "recorded"} · {formatShortDateTime(session.summaryGeneratedAt)}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="inspector-empty">No summary generated yet.</p>
                  <button
                    type="button"
                    className="icon-text-button"
                    disabled={sessions.loading}
                    onClick={generateSummary}
                  >
                    Generate TL;DR
                  </button>
                </>
              )}
              {topics.length ? (
                <div className="inspector-chips">
                  {topics.map((topic) => <span key={topic}>{topic}</span>)}
                </div>
              ) : null}
            </section>

            <section className="inspector-section">
              <h4>Details</h4>
              <dl className="inspector-facts">
                <Fact label="Status" value={session.status} />
                <Fact label="Agent" value={session.agent || "unknown"} />
                <Fact label="Branch" value={session.branch || "none"} />
                <Fact label="Started" value={formatShortDateTime(session.started)} />
                <Fact label="Updated" value={formatShortDateTime(session.updated)} />
                <Fact label="Closed" value={session.closed ? formatShortDateTime(session.closed) : "Still open"} />
              </dl>
            </section>

            <section className="inspector-section">
              <h4>Project graph</h4>
              <label className="inspector-toggle">
                <span>Include in project graph</span>
                <input
                  type="checkbox"
                  checked={Boolean(session.includeInGraph)}
                  disabled={sessions.loading}
                  onChange={(event) => void sessions.updateGraphVisibility(session.id, event.target.checked)}
                />
              </label>
              <p className="inspector-help">
                Use this only for sessions that record an important decision or milestone.
              </p>
            </section>
          </aside>
        </div>
      </Modal>
      {/* Sibling, not a child: the reader is a two-row grid and a nested
          dialog would become a third row of it. */}
      {closeoutOpen && isActive ? (
        <SessionCloseoutDialog
          key={session.id}
          session={session}
          sessions={sessions}
          onCancel={() => setCloseoutOpen(false)}
        />
      ) : null}
    </>
  );
});

/**
 * Closeout is its own step so neither the reader nor the Current Work card has
 * to keep its controls permanently on screen. Callers name the action, since
 * "session" and "work log" are the same thing under different screen labels.
 */
export const SessionCloseoutDialog = observer(function SessionCloseoutDialog({
  session,
  sessions,
  onCancel,
  title = "Close session",
  confirmLabel = "Close session"
}: {
  session: SessionReaderModel;
  sessions: SessionDetailPort;
  onCancel: () => void;
  title?: string;
  confirmLabel?: string;
}) {
  const [summary, setSummary] = useState("");
  const [includeInGraph, setIncludeInGraph] = useState(Boolean(session.includeInGraph));
  const [operationFailed, setOperationFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const busy = sessions.loading || submitting;

  async function closeSession() {
    if (sessions.loading || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setOperationFailed(false);
    try {
      const closed = await executeSessionCloseout({
        sessions,
        sessionId: session.id,
        summary,
        includeInGraph
      });
      if (closed) {
        onCancel();
        return;
      }
    } catch {
      // The owned notice below intentionally avoids exposing raw exception text.
    }
    submittingRef.current = false;
    setSubmitting(false);
    setOperationFailed(true);
  }

  return (
    <Modal
      title={title}
      description="Optionally describe the final outcome or what is still open. A TL;DR is generated either way."
      backdropClassName="modal-backdrop session-closeout-backdrop"
      className="session-closeout-dialog"
      onClose={() => { if (!busy) onCancel(); }}
    >
      {operationFailed ? (
        <StatusNotice tone="danger" assertive title="Session not closed">
          {sessions.error || "Your closeout text is still here. Review the current session and try again."}
        </StatusNotice>
      ) : null}
      <label className="stacked-field" htmlFor="session-closeout-summary">
        <span>Closeout summary</span>
        <textarea
          id="session-closeout-summary"
          rows={4}
          value={summary}
          autoFocus
          disabled={busy}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="Optional"
        />
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={includeInGraph}
          disabled={busy}
          onChange={(event) => setIncludeInGraph(event.target.checked)}
        />
        <span>Include this session in the project graph</span>
      </label>
      <div className="session-closeout-actions">
        <button type="button" data-dialog-cancel disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="icon-text-button primary" disabled={busy} aria-busy={busy} onClick={() => void closeSession()}>
          {busy ? "Closing…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
});

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="inspector-fact">
      <dt>{label}</dt>
      <dd title={value}>{value}</dd>
    </div>
  );
}

function OverflowMenu({
  label,
  children
}: {
  label: string;
  /** Receives an explicit `close`; items decide whether selecting them dismisses the menu. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AnchoredSurface
      open={open}
      onClose={() => setOpen(false)}
      className="overflow-menu"
      surfaceClassName="overflow-menu-items"
      surfaceRole="group"
      ariaLabel={label}
      anchor={({ controlsId, expanded }) => (
        <IconButton
          className={`icon-only ${expanded ? "selected" : ""}`}
          onClick={() => setOpen((current) => !current)}
          label={label}
          aria-expanded={expanded}
          aria-controls={controlsId}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </IconButton>
      )}
    >
      {children(() => setOpen(false))}
    </AnchoredSurface>
  );
}

/**
 * Session bodies open with `# <task title>` and a `Created:` line, both of
 * which the reader header already shows. Dropped only when the heading really
 * matches, so imported or hand-edited bodies keep their own first heading.
 */
export function stripLeadingSessionTitle(body: string | undefined, taskTitle: string): string | undefined {
  if (body === undefined) return undefined;
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index += 1;

  const heading = /^#\s+(.*)$/.exec(lines[index]?.trim() || "");
  if (!heading || heading[1].trim() !== taskTitle.trim()) return body;

  index += 1;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (line && !/^created:\s/i.test(line)) break;
    index += 1;
  }
  return lines.slice(index).join("\n");
}
