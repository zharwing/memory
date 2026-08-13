import type { ReactNode } from "react";

export type DataTableRowId = string | number;

type DataTableColumn<Row extends object> = Extract<keyof Row, string>;

export interface DataTableProps<
  Row extends object,
  Column extends DataTableColumn<Row> = DataTableColumn<Row>
> {
  columns: readonly Column[];
  columnLabels?: Partial<Record<Column, string>>;
  rows: readonly Row[];
  /** Per-column cell renderers; columns without one fall back to the raw value. */
  renderers?: Partial<Record<Column, (row: Row) => ReactNode>>;
  selectedRowId?: DataTableRowId;
  onRowClick?: (row: Row) => void;
  rowActions?: (row: Row) => ReactNode;
  ariaLabel?: string;
}

export function DataTable<
  Row extends object,
  Column extends DataTableColumn<Row> = DataTableColumn<Row>
>({
  columns,
  columnLabels,
  rows,
  renderers,
  selectedRowId,
  onRowClick,
  rowActions,
  ariaLabel = "Results"
}: DataTableProps<Row, Column>) {
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
          {rows.map((row, rowIndex) => {
            const rowId = resolveRowId(row, rowIndex);
            const selected = selectedRowId !== undefined && rowId === selectedRowId;
            return (
              <tr
                key={rowId}
                className={`${onRowClick ? "clickable-row" : ""} ${selected ? "selected-row" : ""}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                aria-current={selected ? "true" : undefined}
                onKeyDown={onRowClick ? (event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onRowClick(row);
                  }
                } : undefined}
              >
                {columns.map((column) => {
                  const render = renderers?.[column];
                  return (
                    <td key={column}>
                      {render ? render(row) : String(row[column] ?? "")}
                    </td>
                  );
                })}
                {rowActions ? (
                  <td className="table-actions" onClick={(event) => event.stopPropagation()}>
                    {rowActions(row)}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function resolveRowId(row: object, rowIndex: number): DataTableRowId {
  const candidate = (row as { readonly id?: unknown }).id;
  return typeof candidate === "string" || typeof candidate === "number"
    ? candidate
    : rowIndex;
}
