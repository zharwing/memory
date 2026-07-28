import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { MoreHorizontal, X } from "lucide-react";
import { useStore } from "../stores/store-context.js";
import { Modal } from "./Modal.js";
import { ConfirmDeleteButton } from "./ConfirmDeleteButton.js";
import { MarkdownPreview } from "./markdown/MarkdownPreview.js";
import { formatShortDateTime } from "../utils/format.js";

const SUMMARY_CLAMP_CHARS = 260;

/**
 * Session reader: the work log gets the dominant reading column, everything
 * supplemental (TL;DR, facts, graph opt-in) sits in a narrow inspector, and
 * closing a session is its own dialog rather than a permanent row of controls.
 * Only the reading column scrolls.
 */
export const SessionDetailModal = observer(function SessionDetailModal({
  session,
  onClose,
  onDeleted
}: {
  session: any;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const store = useStore();
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

  function generateSummary() {
    void store.generateSessionSummary(session.id, true);
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
                disabled={store.loading}
                onClick={() => setCloseoutOpen(true)}
              >
                Close session
              </button>
            ) : null}
            <OverflowMenu label="More session actions">
              {(closeMenu) => (
                <>
                  <button
                    type="button"
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
                      onClick={() => {
                        void navigator.clipboard?.writeText(session.branch);
                        closeMenu();
                      }}
                    >
                      Copy branch name
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={store.loading}
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
                        await store.deleteSession(session.id);
                        (onDeleted || onClose)();
                      }}
                    />
                  </div>
                </>
              )}
            </OverflowMenu>
            <button
              type="button"
              className="icon-button icon-only"
              onClick={onClose}
              title="Close"
              aria-label="Close"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="session-reader-body">
          <main className="session-reader-main">
            {session.closedReason ? <p className="session-close-reason">{session.closedReason}</p> : null}
            {body === undefined ? (
              <div className="rendered-markdown empty-preview">Loading session body…</div>
            ) : body.trim() ? (
              <MarkdownPreview body={body} />
            ) : (
              <div className="rendered-markdown empty-preview">No session body recorded.</div>
            )}
          </main>

          <aside className="session-inspector">
            <section className="inspector-section">
              <div className="inspector-section-head">
                <h4>TL;DR</h4>
                {summary ? (
                  <button type="button" className="link-button" disabled={store.loading} onClick={generateSummary}>
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
                    disabled={store.loading}
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
                  disabled={store.loading}
                  onChange={(event) => void store.updateSessionGraphVisibility(session.id, event.target.checked)}
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
      {closeoutOpen ? (
        <SessionCloseoutDialog session={session} onCancel={() => setCloseoutOpen(false)} />
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
  onCancel,
  title = "Close session",
  confirmLabel = "Close session"
}: {
  session: any;
  onCancel: () => void;
  title?: string;
  confirmLabel?: string;
}) {
  const store = useStore();
  const [summary, setSummary] = useState("");
  const [includeInGraph, setIncludeInGraph] = useState(Boolean(session.includeInGraph));

  async function closeSession() {
    if (includeInGraph !== Boolean(session.includeInGraph)) {
      await store.updateSessionGraphVisibility(session.id, includeInGraph);
    }
    await store.closeSession(session.id, summary);
    onCancel();
  }

  return (
    <Modal
      ariaLabel={title}
      backdropClassName="modal-backdrop session-closeout-backdrop"
      className="session-closeout-dialog"
      onClose={onCancel}
    >
      <h3>{title}</h3>
      <p className="panel-help">
        Optionally describe the final outcome or what is still open. A TL;DR is generated either way.
      </p>
      <label className="stacked-field">
        <span>Closeout summary</span>
        <textarea
          rows={4}
          value={summary}
          autoFocus
          onChange={(event) => setSummary(event.target.value)}
          placeholder="Optional"
        />
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={includeInGraph}
          onChange={(event) => setIncludeInGraph(event.target.checked)}
        />
        <span>Include this session in the project graph</span>
      </label>
      <div className="session-closeout-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" className="icon-text-button primary" disabled={store.loading} onClick={() => void closeSession()}>
          {confirmLabel}
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    // Capture phase so Escape closes the menu instead of the dialog behind it.
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  return (
    <div className="overflow-menu" ref={containerRef}>
      <button
        type="button"
        className={`icon-button icon-only ${open ? "selected" : ""}`}
        onClick={() => setOpen((current) => !current)}
        title={label}
        aria-label={label}
        aria-expanded={open}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="overflow-menu-items" role="menu">
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
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
