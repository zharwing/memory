import assert from "node:assert/strict";
import { test } from "node:test";
import { graphRenderCapability } from "./graph-render-capability.js";

test("a non-DOM runtime degrades to the structured graph boundary", () => {
  const result = graphRenderCapability();
  assert.equal(result.available, false);
});
