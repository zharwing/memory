import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { DataTable } from "./DataTable.js";

test("nested action keyboard events do not activate the containing data row", () => {
  const selected: string[] = [];
  const tree = DataTable({
    columns: ["name"] as const,
    rows: [{ id: "row-1", name: "One" }],
    onRowClick: (row) => selected.push(row.id),
    rowActions: () => <button type="button">Open</button>
  });
  const row = findElements(tree, "tr").find((element) => element.props.tabIndex === 0);
  assert.ok(row);
  const onKeyDown = row.props.onKeyDown as (event: {
    target: object;
    currentTarget: object;
    key: string;
    preventDefault(): void;
  }) => void;
  const rowTarget = {};
  const nestedButtonTarget = {};
  let prevented = false;

  onKeyDown({
    target: nestedButtonTarget,
    currentTarget: rowTarget,
    key: "Enter",
    preventDefault: () => { prevented = true; }
  });
  assert.deepEqual(selected, []);
  assert.equal(prevented, false);

  onKeyDown({
    target: rowTarget,
    currentTarget: rowTarget,
    key: " ",
    preventDefault: () => { prevented = true; }
  });
  assert.deepEqual(selected, ["row-1"]);
  assert.equal(prevented, true);
});

function findElements(node: ReactNode, type: string): Array<ReactElement<Record<string, unknown>>> {
  if (Array.isArray(node)) return node.flatMap((child) => findElements(child, type));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const found = node.type === type ? [node] : [];
  return [...found, ...findElements(node.props.children as ReactNode, type)];
}
