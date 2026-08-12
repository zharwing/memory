import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeGraphPositions } from "./graph-position-store.js";

test("position persistence accepts only exact versioned node sets", () => {
  const valid = {
    version: 3,
    nodeIds: ["a", "b"],
    positions: { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } }
  };
  assert.deepEqual(decodeGraphPositions(valid, ["b", "a"]), valid.positions);
  assert.equal(decodeGraphPositions({ ...valid, version: 2 }, ["a", "b"]), undefined);
  assert.equal(decodeGraphPositions(valid, ["a"]), undefined);
  assert.equal(decodeGraphPositions({ ...valid, positions: { ...valid.positions, b: { x: Infinity, y: 4 } } }, ["a", "b"]), undefined);
});
