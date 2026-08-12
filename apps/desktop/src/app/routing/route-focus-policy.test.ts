import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldMoveFocusToRouteHeading } from "./route-focus-policy.js";

test("route heading focus moves on first render and pathname transitions", () => {
  assert.equal(shouldMoveFocusToRouteHeading(undefined, "/projects"), true);
  assert.equal(shouldMoveFocusToRouteHeading("/projects", "/p/project-one/dashboard"), true);
});

test("query-only state and an equivalent trailing slash do not steal route focus", () => {
  assert.equal(shouldMoveFocusToRouteHeading("/p/project-one/library/graph", "/p/project-one/library/graph"), false);
  assert.equal(shouldMoveFocusToRouteHeading("/p/project-one/library/graph/", "/p/project-one/library/graph"), false);
});
