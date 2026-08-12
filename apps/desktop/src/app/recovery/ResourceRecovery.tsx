import { type ReactNode, useEffect, useRef } from "react";
import type { PublicRecoveryAction } from "@zharwing/memory-core";
import type { ResourceState } from "../../application/resources/resource-state.js";
import { RecoveryPanel } from "./RecoveryPanel.js";

export interface ResourceRecoveryProps<Data> {
  readonly state: ResourceState<Data>;
  readonly children: (data: Data) => ReactNode;
  readonly empty: ReactNode;
  readonly loadingLabel?: string;
  readonly onRetry?: () => void | Promise<void>;
}

/**
 * Truthful resource projection: empty is reachable only from the explicit
 * complete `empty` state; partial, refreshing, stale, and failed observations
 * retain their distinct presentation.
 */
export function ResourceRecovery<Data>({
  state,
  children,
  empty,
  loadingLabel = "Loading…",
  onRetry
}: ResourceRecoveryProps<Data>) {
  const content = useRef<HTMLDivElement>(null);
  const restoreAfterRecovery = useRef(false);
  useEffect(() => {
    if (
      restoreAfterRecovery.current &&
      (state.status === "success" || state.status === "empty")
    ) {
      restoreAfterRecovery.current = false;
      content.current?.focus();
    }
  }, [state.status]);

  async function recover(action: PublicRecoveryAction): Promise<void> {
    if (action === "refresh" || action === "retry" || action === "reconcile") {
      restoreAfterRecovery.current = true;
    }
    await recoverResource(action, onRetry);
  }

  if (state.status === "idle" || state.status === "loading") {
    return <div ref={content} tabIndex={-1}><p className="panel-help" role="status" aria-live="polite">{loadingLabel}</p></div>;
  }
  if (state.status === "failure") {
    if (!state.previous) {
      return (
        <RecoveryPanel
          compact
          surface="resource"
          error={state.error}
          title="This information could not be loaded"
          onRecover={recover}
        />
      );
    }
    return (
      <>
        <RecoveryPanel
          compact
          surface="resource"
          error={state.error}
          title="Showing the last accepted information"
          detail="Refresh failed. The content below may be stale and is not a current observation."
          onRecover={recover}
        />
        {state.previous.completeness.kind === "partial" ? (
          <p className="panel-help" role="status">This stale observation was also partial.</p>
        ) : null}
        {children(state.previous.data)}
      </>
    );
  }
  if (state.status === "empty") return <div ref={content} tabIndex={-1}>{empty}</div>;
  return (
    <div ref={content} tabIndex={-1}>
      {state.status === "refreshing" ? (
        <p className="panel-help" role="status" aria-live="polite">
          Refreshing; showing the last accepted observation.
        </p>
      ) : null}
      {state.completeness.kind === "partial" ? (
        <p className="panel-help" role="status">
          This is a partial result. An empty view or missing item is not authoritative.
        </p>
      ) : null}
      {children(state.data)}
    </div>
  );
}

async function recoverResource(
  action: PublicRecoveryAction,
  onRetry: (() => void | Promise<void>) | undefined
): Promise<void> {
  if (action === "refresh" || action === "retry" || action === "reconcile") await onRetry?.();
  else if (action === "return") history.back();
  else if (action === "reload" || action === "restart-service" || action === "unlock-session") location.reload();
}
