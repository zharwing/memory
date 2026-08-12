import assert from "node:assert/strict";
import { test } from "node:test";
import { createGraphLayoutPlan, nextGraphKeyboardNodeId } from "./graph-layout-adapter.js";

const nodes = [
  { id: "project:one", type: "project", label: "Project" },
  { id: "repo:one", type: "repo", label: "Repo" },
  { id: "topic:one", type: "topic", label: "Topic" }
];
const edges = [
  { source: "project:one", target: "repo:one" },
  { source: "repo:one", target: "topic:one" }
];

test("layout is deterministic and centers an exact focused node", () => {
  const first = createGraphLayoutPlan(nodes, edges, "repo:one");
  const second = createGraphLayoutPlan(nodes, edges, "repo:one");
  assert.deepEqual([...first.positions], [...second.positions]);
  assert.deepEqual(first.positions.get("repo:one"), { x: 0, y: 0 });
  assert.equal(first.degreeByNodeId.get("repo:one"), 2);
});

test("the canvas keyboard model wraps with one active node", () => {
  assert.equal(nextGraphKeyboardNodeId(nodes, "project:one", "previous"), "topic:one");
  assert.equal(nextGraphKeyboardNodeId(nodes, "topic:one", "next"), "project:one");
  assert.equal(nextGraphKeyboardNodeId(nodes, "repo:one", "first"), "project:one");
});
