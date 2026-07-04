import type { ReactNode } from "react";

export function DataTable({
  columns,
  rows,
  selectedRowId,
  onRowClick,
  rowActions
}: {
  columns: string[];
  rows: any[];
  selectedRowId?: string;
  onRowClick?: (row: any) => void;
  rowActions?: (row: any) => ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{column}</th>)}
            {rowActions ? <th aria-label="Actions">actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={row.id || rowIndex}
              className={`${onRowClick ? "clickable-row" : ""} ${selectedRowId && row.id === selectedRowId ? "selected-row" : ""}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => <td key={column}>{String(row[column] ?? "")}</td>)}
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
