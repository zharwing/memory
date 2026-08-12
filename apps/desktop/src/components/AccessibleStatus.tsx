import type { ReactNode } from "react";

export type AsyncStatus =
  | "idle"
  | "loading"
  | "refreshing"
  | "success"
  | "empty"
  | "partial"
  | "stale"
  | "error"
  | "outcome-unknown";

export function VisuallyHidden({ children, as: Element = "span" }: {
  children: ReactNode;
  as?: "span" | "div";
}) {
  return <Element className="sr-only">{children}</Element>;
}

export function StatusNotice({
  tone = "neutral",
  assertive = false,
  announce = "off",
  title,
  children,
  action
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "information";
  /** Live announcement is opt-in so static notices do not produce duplicate speech. */
  announce?: "off" | "polite" | "assertive";
  /** Backward-compatible shorthand for urgent operation failures. */
  assertive?: boolean;
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  const announcement = assertive ? "assertive" : announce;
  return (
    <div
      className={`status-notice status-notice-${tone}`}
      role={announcement === "assertive" ? "alert" : announcement === "polite" ? "status" : undefined}
      aria-live={announcement === "off" ? undefined : announcement}
      aria-atomic={announcement === "off" ? undefined : true}
    >
      <div>
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
      </div>
      {action ? <div className="status-notice-action">{action}</div> : null}
    </div>
  );
}

/**
 * Async state owner. Refreshing, partial, stale, and outcome-unknown states
 * retain the last known content; an initial load never renders empty copy.
 */
export function AsyncRegion({
  status,
  label,
  statusText,
  children,
  loading,
  empty,
  error,
  action,
  className
}: {
  status: AsyncStatus;
  label: string;
  statusText?: string;
  children?: ReactNode;
  loading?: ReactNode;
  empty?: ReactNode;
  error?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const hasKnownContent = children !== undefined && children !== null;
  const retainContent = hasKnownContent && ["refreshing", "partial", "stale", "outcome-unknown", "error", "success"].includes(status);
  let content: ReactNode = children;
  if (status === "loading" && !hasKnownContent) content = loading ?? <LoadingStatus label={`Loading ${label}`} />;
  else if (status === "empty") content = empty;
  else if (status === "error" && !hasKnownContent) content = error;

  return (
    <section
      className={["async-region", `async-region-${status}`, className].filter(Boolean).join(" ")}
      aria-label={label}
      aria-busy={status === "loading" || status === "refreshing"}
    >
      {statusText && (!retainContent || status === "success") ? (
        <div className="sr-only" role={status === "error" ? "alert" : "status"}>{statusText}</div>
      ) : null}
      {retainContent && status !== "success" ? (
        <StatusNotice
          tone={status === "error" ? "danger" : status === "outcome-unknown" ? "warning" : "information"}
          announce={status === "error" || status === "outcome-unknown" ? "assertive" : "polite"}
          action={action}
        >
          {statusText ?? defaultAsyncStatusText(status)}
        </StatusNotice>
      ) : null}
      {content}
    </section>
  );
}

export function LoadingStatus({ label = "Loading" }: { label?: string }) {
  return (
    <div className="loading-status" role="status" aria-live="polite">
      <span className="loading-indicator" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Progress({ label, value, max, detail, className }: {
  label: string;
  value?: number;
  max?: number;
  detail?: ReactNode;
  className?: string;
}) {
  const measured = Number.isFinite(value) && Number.isFinite(max) && Number(max) > 0;
  const boundedMax = measured ? Math.max(1, Number(max)) : undefined;
  const boundedValue = measured ? Math.min(boundedMax!, Math.max(0, Number(value))) : undefined;
  const percent = measured ? Math.round((boundedValue! / boundedMax!) * 100) : undefined;
  if (!measured) {
    const detailText = typeof detail === "string" || typeof detail === "number" ? String(detail) : "";
    return <LoadingStatus label={detailText ? `${label}: ${detailText}` : label} />;
  }
  return (
    <div className={["progress", className].filter(Boolean).join(" ")}>
      <div className="progress-label">
        <span>{label}</span>
        <strong>{detail ?? `${boundedValue} of ${boundedMax}`}</strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={boundedMax}
        aria-valuenow={boundedValue}
        aria-valuetext={String(detail ?? `${boundedValue} of ${boundedMax}`)}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function defaultAsyncStatusText(status: AsyncStatus): string {
  if (status === "refreshing") return "Refreshing; showing the last complete result.";
  if (status === "partial") return "Showing a partial result.";
  if (status === "stale") return "Showing saved information while the service is unavailable.";
  if (status === "outcome-unknown") return "The outcome is not yet known. Check status before retrying.";
  if (status === "error") return "Refresh failed; showing the last accepted result.";
  return "";
}
