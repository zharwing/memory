import assert from "node:assert/strict";
import { test } from "node:test";
import { relationshipsForStructuredNode } from "./StructuredGraphView.js";

test("structured relationships include incoming and outgoing edges in stable order", () => {
  const edges = [
    { id: "z", source: "b", target: "a", type: "supports" },
    { id: "a", source: "a", target: "c", type: "related" },
    { id: "ignored", source: "b", target: "c", type: "contains" }
  ];
  assert.deepEqual(relationshipsForStructuredNode(edges, "a").map((edge) => edge.id), ["a", "z"]);
});
