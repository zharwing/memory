import type { ReactNode } from "react";

export function Screen({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="screen">
      <div className="screen-heading">
        <h2>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/**
 * Empty state. The simple form (`text`) renders the classic `.empty` box.
 * The rich form (`title`/`body`/`action`) renders the strong + paragraph +
 * action shape; pass `className` to keep a screen's existing styling
 * (e.g. `graph-empty-state`).
 */
export function Empty({
  text,
  title,
  body,
  action,
  className
}: {
  text?: string;
  title?: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  if (title || body || action) {
    return (
      <div className={className || "empty"}>
        {title ? <strong>{title}</strong> : null}
        {body ? <p>{body}</p> : null}
        {action}
      </div>
    );
  }
  return <div className={className || "empty"}>{text}</div>;
}

/** Raw text preview: the shared `<pre class="markdown-preview">` block. */
export function RawTextPreview({ text, fallback }: { text?: string; fallback?: string }) {
  return <pre className="markdown-preview">{text || fallback || ""}</pre>;
}
