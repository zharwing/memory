import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertRouteRegistryIntegrity,
  decodeRouteLocation,
  navigationRoutes,
  registeredRouteEntries,
  routePath,
  tabRoutes
} from "./route-registry.js";

test("every registered route path is reachable through the shared decoder", () => {
  assert.doesNotThrow(() => assertRouteRegistryIntegrity());
  for (const route of registeredRouteEntries()) {
    if (route.kind === "wildcard") continue;
    const paths = route.kind === "screen" && route.legacyPath
      ? [route.path, route.legacyPath]
      : [route.path];
    for (const path of paths) {
      const directPath = path.replace(":projectId", "project-one");
      const decoded = decodeRouteLocation(directPath);
      assert.equal(decoded.status, "matched", `${route.id} should decode ${directPath}`);
      if (decoded.status === "matched") assert.equal(decoded.routeId, route.id);
    }
  }
});

test("route builders encode typed project and search inputs", () => {
  assert.equal(routePath("dashboard", { projectId: "project-one" }), "/p/project-one/dashboard");
  assert.equal(routePath("dashboard"), "/dashboard");
  assert.equal(
    routePath("inbox", { projectId: "project-one", search: { proposal: "proposal:one/two" } }),
    "/p/project-one/library/inbox?proposal=proposal%3Aone%2Ftwo"
  );
});

test("malformed direct links fail closed without throwing", () => {
  assert.deepEqual(decodeRouteLocation("/p/%E0%A4%A/dashboard"), { status: "malformed", reason: "encoding" });
  assert.deepEqual(decodeRouteLocation("/p/..%2Fother/dashboard"), { status: "malformed", reason: "encoding" });
  assert.deepEqual(decodeRouteLocation(`/p/${"a".repeat(81)}/dashboard`), { status: "malformed", reason: "project" });
  assert.deepEqual(decodeRouteLocation("/p/project-one/not-registered"), { status: "not_found" });
});

test("back-forward project URLs decode independently and preserve their exact project", () => {
  const sequence = [
    "/p/project-a/dashboard",
    "/p/project-b/library/graph",
    "/p/project-a/work/sessions"
  ].map(decodeRouteLocation);
  assert.deepEqual(sequence.map((item) => item.status === "matched" ? item.projectId : undefined), [
    "project-a",
    "project-b",
    "project-a"
  ]);
});

test("navigation and section tabs are generated from registered screen routes", () => {
  const primary = navigationRoutes("primary");
  const utility = navigationRoutes("utility");
  assert.deepEqual(primary.map((entry) => entry.routeId), ["dashboard", "repositories", "currentWork", "docs", "import", "search"]);
  assert.deepEqual(utility.map((entry) => entry.routeId), ["setup", "trash", "settings"]);
  assert.deepEqual(tabRoutes("work").map((entry) => entry.routeId), ["currentWork", "sessions", "workstreams"]);
  assert.equal(new Set([...primary, ...utility].map((entry) => entry.routeId)).size, primary.length + utility.length);
});
