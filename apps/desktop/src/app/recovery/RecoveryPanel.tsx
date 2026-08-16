import { useEffect, useId, useRef, useState } from "react";
import {
  createPublicError,
  type PublicError,
  type PublicRecoveryAction
} from "@zharwing/memory-core";
import type { DiagnosticSurface } from "../../platform/diagnostics/index.js";
import { DiagnosticReportAction } from "./DiagnosticReportAction.js";
import { useDiagnosticJournal } from "./DiagnosticJournalContext.js";
import {
  publicMessageCopy,
  recoveryActionCopy,
  recoveryFailureCopy
} from "./public-error-copy.js";

export interface RecoveryPanelProps {
  readonly error?: PublicError;
  readonly surface: DiagnosticSurface;
  readonly title?: string;
  readonly detail?: string;
  readonly compact?: boolean;
  readonly focusOnMount?: boolean;
  readonly onRecover?: (action: PublicRecoveryAction) => void | Promise<void>;
}

export function RecoveryPanel({
  error = createPublicError("internal"),
  surface,
  title = "Something went wrong",
  detail,
  compact = false,
  focusOnMount = true,
  onRecover
}: RecoveryPanelProps) {
  const diagnostics = useDiagnosticJournal();
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);
  const headingId = useId();
  const [recovering, setRecovering] = useState(false);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  useEffect(() => {
    setRecoveryFailed(false);
    if (focusOnMount) heading.current?.focus();
  }, [error.code, error.debugId, error.messageId, focusOnMount]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function recover(action: PublicRecoveryAction) {
    if (recovering) return;
    setRecovering(true);
    setRecoveryFailed(false);
    diagnostics.recordEvent({ name: "recovery.requested", surface, publicError: error, recoveryAction: action });
    try {
      if (usesCallerRecovery(action) && onRecover) await onRecover(action);
      else applyDefaultRecovery(action);
      diagnostics.recordEvent({
        name: "recovery.completed",
        surface,
        publicError: error,
        recoveryAction: action,
        outcome: "accepted"
      });
    } catch {
      diagnostics.recordEvent({
        name: "recovery.failed",
        surface,
        publicError: error,
        recoveryAction: action,
        outcome: "unknown"
      });
      if (mounted.current) setRecoveryFailed(true);
    } finally {
      if (mounted.current) setRecovering(false);
    }
  }

  return (
    <section
      className={`recovery-panel notice danger${compact ? " compact" : ""}`}
      role="alert"
      aria-labelledby={headingId}
      aria-busy={recovering}
    >
      <h2 id={headingId} ref={heading} tabIndex={-1}>{title}</h2>
      <p>{detail ?? publicMessageCopy(error.messageId)}</p>
      <div className="button-row">
        {error.recoveryActions.map((action) => (
          <button key={action} type="button" disabled={recovering} onClick={() => void recover(action)}>
            {recoveryActionCopy(action)}
          </button>
        ))}
        <DiagnosticReportAction />
      </div>
      {recoveryFailed ? (
        <p className="panel-help" role="alert">{recoveryFailureCopy()}</p>
      ) : null}
      {error.debugId ? <p className="panel-help">Diagnostic ID: <code>{error.debugId}</code></p> : null}
    </section>
  );
}

function usesCallerRecovery(action: PublicRecoveryAction): boolean {
  return action === "review-input" || action === "refresh" || action === "retry" || action === "reconcile";
}

function applyDefaultRecovery(action: PublicRecoveryAction): void {
  switch (action) {
    case "return":
      history.back();
      return;
    case "reload":
    case "restart-service":
    case "unlock-session":
      location.reload();
      return;
    case "review-input":
    case "refresh":
    case "retry":
    case "reconcile":
      return;
  }
}
