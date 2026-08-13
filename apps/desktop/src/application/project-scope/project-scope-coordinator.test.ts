import assert from "node:assert/strict";
import test from "node:test";
import {
  ApplicationScopeCoordinator,
  ProjectScopeCoordinator
} from "./project-scope-coordinator.js";

test("project scope switches abort old work and disposal aborts the active generation", () => {
  const scope = new ProjectScopeCoordinator();
  const transitions: Array<{ next?: string; previous?: string }> = [];
  scope.onScopeReset((next, previous) => {
    transitions.push({ next: next?.projectId, previous: previous?.projectId });
  });

  const first = scope.activate(" project-a ", "D:/repos/a");
  assert.ok(first);
  assert.equal(first.projectId, "project-a");
  assert.equal(first.signal.aborted, false);
  assert.equal(scope.currentProjectWorkingDirectory(), "D:/repos/a");

  const second = scope.activate("project-b", "D:/repos/b");
  assert.ok(second);
  assert.equal(first.signal.aborted, true);
  assert.equal(scope.isScopeCurrent(first), false);
  assert.equal(scope.isScopeCurrent(second), true);

  scope.dispose();
  assert.equal(second.signal.aborted, true);
  assert.equal(scope.captureScope(), undefined);
  assert.equal(scope.activate("project-c"), undefined);
  assert.deepEqual(transitions, [
    { next: "project-a", previous: undefined },
    { next: "project-b", previous: "project-a" },
    { next: undefined, previous: "project-b" }
  ]);
});

test("application scope disposal aborts app-wide work exactly once", () => {
  const scope = new ApplicationScopeCoordinator();
  const token = scope.captureScope();
  assert.ok(token);
  assert.equal(scope.isScopeCurrent(token), true);

  scope.dispose();
  scope.dispose();

  assert.equal(token.signal.aborted, true);
  assert.equal(scope.isScopeCurrent(token), false);
  assert.equal(scope.captureScope(), undefined);
});
