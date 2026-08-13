import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldMoveFocusToRouteHeading } from "./route-focus-policy.js";

test("route heading focus stays quiet on reload and moves on pathname transitions", () => {
  assert.equal(shouldMoveFocusToRouteHeading(undefined, "/projects"), false);
  assert.equal(shouldMoveFocusToRouteHeading("/projects", "/p/project-one/dashboard"), true);
});

test("query-only state and an equivalent trailing slash do not steal route focus", () => {
  assert.equal(shouldMoveFocusToRouteHeading("/p/project-one/library/graph", "/p/project-one/library/graph"), false);
  assert.equal(shouldMoveFocusToRouteHeading("/p/project-one/library/graph/", "/p/project-one/library/graph"), false);
});
