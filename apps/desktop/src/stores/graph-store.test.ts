import assert from "node:assert/strict";
import { test } from "node:test";
import { graphRelationshipParams } from "./graph-store.js";

test("graph state maps relationship modes to closed typed operation parameters", () => {
  assert.deepEqual(graphRelationshipParams("deterministic"), {
    includeSemantic: "none",
    includeSemanticProposals: false
  });
  assert.deepEqual(graphRelationshipParams("ai-reviewed"), {
    includeSemantic: "accepted",
    includeSemanticProposals: false
  });
});
