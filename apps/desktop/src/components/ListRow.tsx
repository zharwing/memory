import type { ReactNode } from "react";

/**
 * The `.repo-row` list-item shape: optional leading slot (e.g. a checkbox),
 * a title with detail lines, and trailing actions. Used by Repositories,
 * Backups, and Trash.
 */
export function ListRow({
  leading,
  title,
  details,
  actions
}: {
  leading?: ReactNode;
  title: ReactNode;
  details?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="repo-row">
      {leading}
      <div>
        <strong>{title}</strong>
        {details}
      </div>
      {actions}
    </div>
  );
}
