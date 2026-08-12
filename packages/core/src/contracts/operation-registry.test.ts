import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DESKTOP_OPERATIONS,
  AGENT_OPERATIONS,
  OPERATION_REGISTRY,
  RPC_COMPATIBILITY_VERSION,
  getOperationDefinition,
  getOperationAdmissionMetadata,
  extractOperationProjectId,
  getOperationProjectScope,
  isDesktopOperation,
  isOperationName,
  operationRegistryManifest,
  operationsForAudience,
  parseOperationInput,
  parseOperationOutput,
  type OperationName
} from "./operation-registry.js";
import { ContractDecodeError } from "./runtime-schema.js";
import { PUBLIC_ERROR_REGISTRY } from "./public-errors.js";

const operationNames = Object.keys(OPERATION_REGISTRY) as OperationName[];

test("the operation registry is a substantial, unique, namespaced authority", () => {
  assert.ok(operationNames.length > 75, `expected the complete RPC inventory, found ${operationNames.length}`);
  assert.equal(new Set(operationNames).size, operationNames.length);
  assert.ok(operationNames.every((name) => /^memory\.[a-z_]+$/.test(name)));

  assert.equal(isOperationName("memory.health"), true);
  assert.equal(isOperationName("memory.not_registered"), false);
  assert.equal(isOperationName("health"), false);
});

test("provider checks reject caller-supplied credentials", () => {
  assert.throws(() => parseOperationInput("memory.check_semantic_graph_provider", {
    projectId: "project-a",
    apiKey: "caller-secret"
  }), ContractDecodeError);
});

test("every operation carries complete bounded metadata and closed public errors", () => {
  const publicCodes = new Set(Object.keys(PUBLIC_ERROR_REGISTRY));

  for (const name of operationNames) {
    const definition = getOperationDefinition(name);
    assert.equal(definition.compatibilityVersion, RPC_COMPATIBILITY_VERSION, name);
    assert.ok(["read", "proposal", "mutation", "destructive"].includes(definition.effect), name);
    assert.ok(definition.audiences.length > 0, `${name} has no audience`);
    assert.equal(new Set(definition.audiences).size, definition.audiences.length, `${name} repeats an audience`);
    assert.ok(definition.timeoutMs > 0 && definition.timeoutMs <= 180_000, `${name} has an unbounded timeout`);
    assert.ok(
      definition.maximumResponseBytes > 0 && definition.maximumResponseBytes <= 8 * 1024 * 1024,
      `${name} has an invalid response limit`
    );
    assert.ok(definition.publicErrors.length > 0, `${name} has no declared public outcomes`);
    assert.equal(new Set(definition.publicErrors).size, definition.publicErrors.length, `${name} repeats an error`);
    assert.ok(definition.publicErrors.every((code) => publicCodes.has(code)), `${name} has an open error code`);
    assert.equal(new Set(definition.invalidates).size, definition.invalidates.length, `${name} repeats invalidation`);
    for (const [audience, scope] of Object.entries(definition.projectScopeByAudience)) {
      assert.ok(definition.audiences.includes(audience as never), `${name} overrides an excluded audience`);
      assert.ok(scope === "none" || scope === "required", `${name} has an invalid audience project scope`);
    }

    if (definition.effect === "destructive") {
      assert.ok(definition.invalidates.length > 0, `${name} is destructive without explicit invalidation`);
    }
    if (definition.idempotency === "required") {
      assert.notEqual(definition.effect, "read", `${name} requires idempotency despite being a read`);
    }
  }
});

test("project-scoped operations require a projectId at the runtime boundary", () => {
  for (const name of operationNames) {
    const definition = OPERATION_REGISTRY[name];
    if (definition.projectScope !== "required") continue;
    assert.throws(
      () => definition.input.parse({}, `${name}.input`),
      (error: unknown) =>
        error instanceof ContractDecodeError && error.path === `${name}.input.projectId`,
      `${name} does not enforce its declared project scope`
    );
  }
});

test("desktop operation inventory is sorted, unique, registered, and desktop-addressable", () => {
  assert.ok(DESKTOP_OPERATIONS.length > 50, `expected the migrated frontend surface, found ${DESKTOP_OPERATIONS.length}`);
  assert.equal(new Set(DESKTOP_OPERATIONS).size, DESKTOP_OPERATIONS.length);
  assert.deepEqual(DESKTOP_OPERATIONS, [...DESKTOP_OPERATIONS].sort());

  for (const name of DESKTOP_OPERATIONS) {
    assert.equal(isOperationName(name), true, name);
    assert.equal(isDesktopOperation(name), true, name);
    assert.ok(OPERATION_REGISTRY[name].audiences.includes("desktop"), `${name} excludes its desktop caller`);
  }
  assert.equal(isDesktopOperation("memory.not_registered"), false);
  assert.equal(isDesktopOperation("memory.get_project"), false);
});

test("principal audiences are registry-exhaustive and agent authority is exact", () => {
  const expectedAgentOperations = [
    "memory.close_session",
    "memory.get_context_bundle",
    "memory.get_latest_session",
    "memory.get_recent_sessions",
    "memory.get_session_detail",
    "memory.get_startup_state",
    "memory.health",
    "memory.preview_context_bundle",
    "memory.save_checkpoint",
    "memory.search",
    "memory.start_session"
  ];

  assert.deepEqual([...AGENT_OPERATIONS].sort(), expectedAgentOperations);
  assert.deepEqual([...operationsForAudience("agent")].sort(), expectedAgentOperations);
  assert.deepEqual(
    [...operationsForAudience("browser")].sort(),
    [...DESKTOP_OPERATIONS].filter((name) => OPERATION_REGISTRY[name].audiences.includes("browser")).sort()
  );
  assert.deepEqual([...operationsForAudience("desktop")].sort(), [...operationNames].sort());
  assert.deepEqual([...operationsForAudience("admin")].sort(), [...operationNames].sort());
  assert.deepEqual([...operationsForAudience("provider")], ["memory.check_semantic_graph_provider"]);
  assert.deepEqual(
    [...operationsForAudience("backup")].sort(),
    [
      "memory.backup_project",
      "memory.cancel_destructive_intent",
      "memory.commit_destructive_intent",
      "memory.delete_backup",
      "memory.list_backups",
      "memory.prepare_destructive_intent"
    ]
  );
  assert.equal(getOperationProjectScope("memory.get_startup_state", "agent"), "required");
  assert.equal(getOperationProjectScope("memory.get_startup_state", "browser"), "required");
  for (const globalControlOperation of [
    "memory.mcp_doctor",
    "memory.mcp_install",
    "memory.list_trash",
    "memory.restore_trash_item",
    "memory.purge_trash_item",
    "memory.empty_trash"
  ] as const) {
    assert.equal(
      operationsForAudience("browser").includes(globalControlOperation),
      false,
      `${globalControlOperation} must not be reachable from a project-bound browser principal`
    );
  }
  for (const agentEffect of [
    "memory.start_session",
    "memory.save_checkpoint",
    "memory.close_session",
    "memory.get_context_bundle"
  ] as const) {
    assert.equal(OPERATION_REGISTRY[agentEffect].idempotency, "required", agentEffect);
  }

  for (const name of operationNames) {
    const metadata = getOperationAdmissionMetadata(name);
    assert.equal(metadata.name, name);
    assert.deepEqual(metadata.audiences, OPERATION_REGISTRY[name].audiences, name);
    if (metadata.audiences.includes("agent")) {
      assert.equal(metadata.privacyProjection, "agent", `${name} bypasses agent projection`);
    }
  }
});

test("registrar project extraction reads only an exact top-level string", () => {
  assert.equal(extractOperationProjectId("memory.search", { projectId: "project-a" }), "project-a");
  assert.equal(extractOperationProjectId("memory.search", { projectId: 7 }), undefined);
  assert.equal(extractOperationProjectId("memory.search", { nested: { projectId: "project-a" } }), undefined);
});

test("input decoders reject coercion and unknown properties with operation paths", () => {
  assert.deepEqual(parseOperationInput("memory.health", {}), {});
  assert.deepEqual(parseOperationInput("memory.search", { projectId: "p1", query: "contract", limit: 5 }), {
    projectId: "p1",
    query: "contract",
    limit: 5
  });
  assert.throws(
    () => parseOperationInput("memory.search", { projectId: "p1", query: "contract", limit: "5" }),
    (error: unknown) => error instanceof ContractDecodeError && error.path === "memory.search.input.limit"
  );
  assert.throws(
    () => parseOperationInput("memory.search", { projectId: "p1", query: "contract", extra: true }),
    (error: unknown) => error instanceof ContractDecodeError && error.path === "memory.search.input.extra"
  );
  assert.throws(
    () => parseOperationInput("memory.update_workstream_status", {
      projectId: "p1",
      workstreamId: "w1",
      status: "complete"
    }),
    /status/
  );
});

test("semantic proposal acceptance input matches the daemon filter contract", () => {
  const graphScreenInput = {
    projectId: "p1",
    proposalId: "proposal-1",
    edgeIndexes: [2]
  };
  assert.deepEqual(
    parseOperationInput("memory.accept_semantic_edges_proposal", graphScreenInput),
    graphScreenInput
  );

  const input = {
    projectId: "p1",
    proposalId: "proposal-1",
    status: "auto-accepted" as const,
    minConfidence: 0.6,
    maxConfidence: 0.9,
    edgeIndexes: [0, 2]
  };
  assert.deepEqual(parseOperationInput("memory.accept_semantic_edges_proposal", input), input);
  assert.throws(
    () => parseOperationInput("memory.accept_semantic_edges_proposal", {
      projectId: "p1",
      proposalId: "proposal-1",
      edgeIds: ["edge-1"]
    }),
    (error: unknown) =>
      error instanceof ContractDecodeError &&
      error.path === "memory.accept_semantic_edges_proposal.input.edgeIds"
  );
  assert.throws(
    () => parseOperationInput("memory.accept_semantic_edges_proposal", {
      projectId: "p1",
      proposalId: "proposal-1",
      status: "proposed"
    }),
    (error: unknown) =>
      error instanceof ContractDecodeError &&
      error.path === "memory.accept_semantic_edges_proposal.input.status"
  );
  assert.throws(
    () => parseOperationInput("memory.accept_semantic_edges_proposal", {
      projectId: "p1",
      proposalId: "proposal-1",
      edgeIndexes: [-1]
    }),
    (error: unknown) =>
      error instanceof ContractDecodeError &&
      error.path === "memory.accept_semantic_edges_proposal.input.edgeIndexes[0]"
  );
  assert.throws(
    () => parseOperationInput("memory.accept_semantic_edges_proposal", {
      projectId: "p1",
      proposalId: "proposal-1",
      edgeIndexes: [0.5]
    }),
    (error: unknown) =>
      error instanceof ContractDecodeError &&
      error.path === "memory.accept_semantic_edges_proposal.input.edgeIndexes[0]"
  );
});

test("output decoders validate remote payloads before state can consume them", () => {
  assert.deepEqual(parseOperationOutput("memory.health", {
    status: "ok",
    memoryRoot: "D:/memory",
    compatibleExtension: true
  }), {
    status: "ok",
    memoryRoot: "D:/memory",
    compatibleExtension: true
  });

  const searchResult = {
    id: "doc-1",
    projectId: "p1",
    type: "document",
    title: "Runtime contracts",
    snippet: "One authority validates remote data.",
    score: 0.9,
    futureField: "preserved"
  };
  assert.deepEqual(parseOperationOutput("memory.search", [searchResult]), [searchResult]);
  assert.throws(
    () => parseOperationOutput("memory.search", [{ ...searchResult, score: "high" }]),
    (error: unknown) => error instanceof ContractDecodeError && error.path === "memory.search.output[0].score"
  );
  assert.throws(
    () => parseOperationOutput("memory.list_projects", { projects: [] }),
    (error: unknown) => error instanceof ContractDecodeError && error.path === "memory.list_projects.output"
  );
});

test("registry manifests expose metadata without schemas and return defensive array copies", () => {
  const manifest = operationRegistryManifest();
  assert.equal(manifest.length, operationNames.length);
  assert.deepEqual(manifest.map((entry) => entry.name), operationNames);
  assert.equal("input" in manifest[0], false);
  assert.equal("output" in manifest[0], false);

  const first = manifest[0];
  const registeredAudienceCount = OPERATION_REGISTRY[first.name].audiences.length;
  const registeredErrorCount = OPERATION_REGISTRY[first.name].publicErrors.length;
  (first.audiences as string[]).push("test-only");
  (first.publicErrors as string[]).push("test-only");
  assert.equal(OPERATION_REGISTRY[first.name].audiences.length, registeredAudienceCount);
  assert.equal(OPERATION_REGISTRY[first.name].publicErrors.length, registeredErrorCount);

  const startup = manifest.find((entry) => entry.name === "memory.get_startup_state");
  assert.ok(startup);
  startup.projectScopeByAudience.agent = "none";
  assert.equal(OPERATION_REGISTRY["memory.get_startup_state"].projectScopeByAudience.agent, "required");
});
