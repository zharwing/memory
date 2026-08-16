import assert from "node:assert/strict";
import { test } from "node:test";
import type { MemoryClient } from "@zharwing/memory-api-client";
import type { GraphRelationshipPreferenceStore } from "../application/persistence/app-persistence.js";
import { ProjectScopeCoordinator } from "../application/project-scope/project-scope-coordinator.js";
import { fixtureGraph } from "../testing/fixture-data.js";
import { GraphStore, graphRelationshipParams } from "./graph-store.js";

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

test("graph relationship preferences use the injected store and preserve the compatibility key", async () => {
  const reads: string[] = [];
  const writes: string[] = [];
  const preferences: GraphRelationshipPreferenceStore = {
    read() {
      reads.push("aimem.graph.relationshipMode");
      return "ai-reviewed";
    },
    write(value) {
      writes.push(value);
    }
  };
  const requests: Array<{ name: string; input: unknown }> = [];
  const client = {
    async operation(name: string, input: unknown) {
      requests.push({ name, input });
      return fixtureGraph;
    }
  } as unknown as MemoryClient;
  const scope = new ProjectScopeCoordinator();
  scope.activate(fixtureGraph.projectId);
  const store = new GraphStore(client, scope, {
    executeCommand: async () => undefined,
    refreshProjects: async () => undefined,
    refreshProjectSummary: async () => undefined,
    refreshInbox: async () => undefined
  }, preferences, {
    createId: (prefix) => `${prefix}:test`,
    now: () => "2031-04-05T12:00:00.000Z"
  });

  assert.equal(store.relationshipMode, "ai-reviewed");
  assert.deepEqual(reads, ["aimem.graph.relationshipMode"]);

  await store.setRelationshipMode("deterministic");

  assert.deepEqual(writes, ["deterministic"]);
  assert.deepEqual(requests, [{
    name: "memory.get_graph",
    input: {
      projectId: fixtureGraph.projectId,
      includeSemantic: "none",
      includeSemanticProposals: false
    }
  }]);
  scope.dispose();
});
