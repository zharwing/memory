import type { ReactNode } from "react";
import { createPublicError, type PublicRecoveryAction } from "@zharwing/memory-core";
import type { OperationState } from "../../application/operations/operation-state.js";
import { RecoveryPanel } from "./RecoveryPanel.js";

export function OperationRecovery({
  state,
  children,
  onRetry,
  onReconcile,
  onReviewInput,
  onRecoveredFocus
}: {
  readonly state: OperationState;
  readonly children?: ReactNode;
  readonly onRetry?: () => void | Promise<void>;
  readonly onReconcile?: () => void | Promise<void>;
  readonly onReviewInput?: () => void;
  readonly onRecoveredFocus?: () => void;
}) {
  async function recover(action: PublicRecoveryAction): Promise<void> {
    await recoverOperation(action, onRetry, onReconcile, onReviewInput);
    if (action === "retry" || action === "refresh" || action === "reconcile") onRecoveredFocus?.();
  }
  if (state.status === "submitting") {
    return <p className="panel-help" role="status" aria-live="polite">Saving…</p>;
  }
  if (state.status === "reconciling") {
    return (
      <RecoveryPanel
        compact
        surface="operation"
        error={state.error ?? createPublicError("outcome_unknown")}
        title="Confirm the authoritative result"
        onRecover={recover}
      />
    );
  }
  if (state.status === "failed" || state.status === "refused") {
    return (
      <RecoveryPanel
        compact
        surface="operation"
        error={state.error}
        title={state.status === "refused" ? "The action was not accepted" : "The action failed"}
        onRecover={recover}
      />
    );
  }
  return <>{children}</>;
}

async function recoverOperation(
  action: PublicRecoveryAction,
  onRetry: (() => void | Promise<void>) | undefined,
  onReconcile: (() => void | Promise<void>) | undefined,
  onReviewInput: (() => void) | undefined
): Promise<void> {
  if (action === "review-input") onReviewInput?.();
  else if (action === "reconcile" || action === "refresh") await onReconcile?.();
  else if (action === "retry") await onRetry?.();
  else if (action === "return") history.back();
  else if (action === "reload" || action === "restart-service" || action === "unlock-session") location.reload();
}
