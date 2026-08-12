import assert from "node:assert/strict";
import { test } from "node:test";
import {
  durableSemanticEdgeId,
  proposedSemanticEdgeTarget,
  semanticScopeKey,
  semanticScopeSummary
} from "./semantic-review-adapter.js";

test("semantic review scope identities are stable and typed", () => {
  assert.equal(semanticScopeKey({ kind: "focused-graph-node", nodeId: "topic:one" }), "focused-graph-node:topic:one");
  assert.equal(semanticScopeSummary({ kind: "changed-docs" }).title, "Changed docs");
});

test("semantic relationship targets reject malformed and oversized identities", () => {
  assert.deepEqual(proposedSemanticEdgeTarget("proposal:proposal-one:2"), { proposalId: "proposal-one", edgeIndex: 2 });
  assert.equal(proposedSemanticEdgeTarget("proposal:proposal-one:-1"), undefined);
  assert.equal(durableSemanticEdgeId(`edge-${"x".repeat(300)}`), undefined);
  assert.equal(durableSemanticEdgeId("edge-one"), "edge-one");
});
