import assert from "node:assert/strict";
import { test } from "node:test";
import {
  graphKeyboardCommandForKey,
  reconcileGraphNodeSelection,
  transitionGraphFocus
} from "./graph-interaction-state.js";

test("graph selection remains synchronized with a valid focus", () => {
  const nodeIds = new Set(["repo:a", "topic:b"]);
  assert.equal(reconcileGraphNodeSelection(nodeIds, "topic:b", "repo:a"), "repo:a");
  assert.equal(reconcileGraphNodeSelection(nodeIds, "topic:b", ""), "topic:b");
  assert.equal(reconcileGraphNodeSelection(nodeIds, "missing", ""), "repo:a");
});

test("graph focus history supports drill-in, backtrack, and overview", () => {
  const first = transitionGraphFocus({ focusedNodeId: "", history: [] }, "repo:a", false);
  const second = transitionGraphFocus(first, "topic:b", false);
  assert.deepEqual(second, { focusedNodeId: "topic:b", history: ["repo:a"] });
  assert.deepEqual(transitionGraphFocus(second, "topic:b", false), first);
  assert.deepEqual(transitionGraphFocus(second, "project:one", true), { focusedNodeId: "", history: [] });
});

test("the visual canvas maps many keys onto one bounded active-node model", () => {
  assert.equal(graphKeyboardCommandForKey("ArrowRight"), "next");
  assert.equal(graphKeyboardCommandForKey("ArrowUp"), "previous");
  assert.equal(graphKeyboardCommandForKey("Home"), "first");
  assert.equal(graphKeyboardCommandForKey("Tab"), undefined);
});
