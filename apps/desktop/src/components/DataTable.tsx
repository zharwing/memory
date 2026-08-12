import type { ReactNode } from "react";

export function DataTable({
  columns,
  columnLabels,
  rows,
  renderers,
  selectedRowId,
  onRowClick,
  rowActions,
  ariaLabel = "Results"
}: {
  columns: string[];
  columnLabels?: Record<string, string>;
  rows: any[];
  /** Per-column cell renderers; columns without one fall back to the raw value. */
  renderers?: Record<string, (row: any) => ReactNode>;
  selectedRowId?: string;
  onRowClick?: (row: any) => void;
  rowActions?: (row: any) => ReactNode;
  ariaLabel?: string;
}) {
  return (
    <div className="table-wrap">
      <table aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map((column) => <th key={column} scope="col">{columnLabels?.[column] || column}</th>)}
            {rowActions ? <th scope="col">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={row.id || rowIndex}
              className={`${onRowClick ? "clickable-row" : ""} ${selectedRowId && row.id === selectedRowId ? "selected-row" : ""}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              aria-current={selectedRowId && row.id === selectedRowId ? "true" : undefined}
              onKeyDown={onRowClick ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onRowClick(row);
                }
              } : undefined}
            >
              {columns.map((column) => (
                <td key={column}>{renderers?.[column] ? renderers[column](row) : String(row[column] ?? "")}</td>
              ))}
              {rowActions ? (
                <td className="table-actions" onClick={(event) => event.stopPropagation()}>
                  {rowActions(row)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
