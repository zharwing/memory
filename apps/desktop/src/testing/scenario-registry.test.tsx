import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXTURE_PROJECT_ID,
  SYNTHETIC_PRIVACY_CANARY,
  fixtureContextBundle
} from "./fixture-data.js";
import { createProductionScenario } from "./production-scenario.js";
import {
  FRONTEND_SCENARIOS,
  SCENARIO_REQUIREMENTS,
  createScenarioTransport
} from "./scenario-registry.js";

test("scenario registry covers every required state and capability", () => {
  const covered = new Set(FRONTEND_SCENARIOS.flatMap((scenario) => scenario.requirements));
  assert.deepEqual([...SCENARIO_REQUIREMENTS].filter((requirement) => !covered.has(requirement)), []);
  assert.equal(new Set(FRONTEND_SCENARIOS.map((scenario) => scenario.id)).size, FRONTEND_SCENARIOS.length);
  for (const scenario of FRONTEND_SCENARIOS) {
    assert.match(scenario.route, /^\//);
    assert.ok(scenario.requirements.length > 0, `${scenario.id} has no traceable requirement`);
    // Construction validates every registered success payload with production schemas.
    createScenarioTransport(scenario.id);
  }
});

test("production scenario composes the real runtime, store graph, routes and App", async () => {
  const harness = createProductionScenario("populated-complete");
  try {
    assert.equal(harness.scenario.id, "populated-complete");
    assert.ok(harness.element);
    assert.equal(harness.runtime.services.memory !== undefined, true);
    assert.equal(harness.runtime.store.projects.list.length, 0);

    await harness.runtime.store.initialize(FIXTURE_PROJECT_ID);

    assert.equal(harness.runtime.store.projects.selectedProjectId, FIXTURE_PROJECT_ID);
    assert.equal(harness.runtime.store.projects.list[0].id, FIXTURE_PROJECT_ID);
    assert.equal(harness.runtime.store.docs.list[0].projectId, FIXTURE_PROJECT_ID);
    assert.equal(harness.runtime.store.graph.data?.projectId, FIXTURE_PROJECT_ID);
    assert.ok(harness.transport.requests.length >= 10);
    assert.equal(harness.transport.requests.every((request) => !request.projectId || request.projectId === FIXTURE_PROJECT_ID), true);
  } finally {
    harness.dispose();
  }
});

test("privacy fixtures exclude the synthetic canary from every served context value", () => {
  assert.equal(JSON.stringify(fixtureContextBundle).includes(SYNTHETIC_PRIVACY_CANARY), false);
  assert.equal(fixtureContextBundle.excludedItems[0].reason, "never-send");
  const includedVisibilities = fixtureContextBundle.includedItems.map((item) => String(item.visibility));
  assert.equal(includedVisibilities.includes("never-send"), false);
});
