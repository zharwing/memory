import assert from "node:assert/strict";
import test from "node:test";
import { graphRulesFromProposalPatch } from "./graph-proposals.js";

test("proposal graph rules normalize legacy snake_case aliases", () => {
  assert.deepEqual(
    graphRulesFromProposalPatch(JSON.stringify({
      graph_rules: [{
        match: "services/*",
        node_type: "code_area",
        edge_type: "depends_on",
        slug_from_segment: 1,
        label_from_segment: 2
      }]
    })),
    [{
      match: "services/*",
      nodeType: "code-area",
      edgeType: "depends-on",
      slugFromSegment: 1,
      labelFromSegment: 2
    }]
  );
});

test("proposal graph rules fail closed when any entry is invalid", () => {
  assert.equal(
    graphRulesFromProposalPatch(JSON.stringify([
      { match: "services/*", nodeType: "service" },
      { match: "packages/*", node_type: "unregistered" }
    ])),
    undefined
  );
});
