import assert from "node:assert/strict";
import { test } from "node:test";
import { virtualizeGraph } from "./graph-virtualization.js";

test("large graph projections obey DOM budgets and retain the focus", () => {
  const nodes = Array.from({ length: 1_000 }, (_, index) => ({
    id: `node:${index}`,
    type: index === 999 ? "doc" : "topic",
    label: `Node ${index}`
  }));
  const edges = Array.from({ length: 999 }, (_, index) => ({
    id: `edge:${index}`,
    source: `node:${index}`,
    target: `node:${index + 1}`,
    type: "related"
  }));

  const projection = virtualizeGraph(nodes, edges, "node:999", { maximumNodes: 40, maximumEdges: 50 });
  assert.equal(projection.nodes.length, 40);
  assert.ok(projection.edges.length <= 50);
  assert.equal(projection.nodes.some((node) => node.id === "node:999"), true);
  assert.equal(projection.omittedNodeCount, 960);
  assert.equal(projection.limited, true);
});

test("virtualization order is stable when source arrays are reversed", () => {
  const nodes = [
    { id: "a", type: "topic", label: "Alpha" },
    { id: "b", type: "topic", label: "Beta" },
    { id: "c", type: "topic", label: "Gamma" }
  ];
  const edges = [{ id: "ab", source: "a", target: "b", type: "related" }];
  const first = virtualizeGraph(nodes, edges, "", { maximumNodes: 2, maximumEdges: 2 });
  const second = virtualizeGraph([...nodes].reverse(), [...edges].reverse(), "", { maximumNodes: 2, maximumEdges: 2 });
  assert.deepEqual(first.nodes.map((node) => node.id), second.nodes.map((node) => node.id));
});
