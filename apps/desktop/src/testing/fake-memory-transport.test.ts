import assert from "node:assert/strict";
import test from "node:test";
import {
  OperationClient,
  OperationError,
  type ClientRuntime
} from "@zharwing/memory-api-client";
import { FIXTURE_PROJECT_ID, fixtureDocument, fixtureProject } from "./fixture-data.js";
import {
  FakeMemoryTransport,
  fakeMalformed,
  fakeSuccess,
  fakeTransportError
} from "./fake-memory-transport.js";

const runtime: ClientRuntime = {
  createId: () => "scenario-correlation-1",
  setTimeout: () => 1 as unknown as ReturnType<typeof setTimeout>,
  clearTimeout: () => undefined
};

test("fake carrier uses the production OperationClient decoders", async () => {
  const transport = new FakeMemoryTransport({
    responses: { "memory.list_projects": [fakeSuccess([fixtureProject])] }
  });
  const client = new OperationClient(transport, runtime, "desktop");

  const projects = await client.operation("memory.list_projects");

  assert.deepEqual(projects, [fixtureProject]);
  assert.deepEqual(transport.requests.map((request) => request.operation), ["memory.list_projects"]);
  assert.equal(transport.requests[0].correlationId, "scenario-correlation-1");
});

test("invalid success fixtures are rejected when the fake plan is registered", () => {
  assert.throws(
    () => new FakeMemoryTransport({
      responses: { "memory.list_projects": [fakeSuccess({ projects: [] })] }
    }),
    /memory\.list_projects\.output/
  );
});

test("malformed envelopes fail through the production protocol error", async () => {
  const transport = new FakeMemoryTransport({
    responses: { "memory.list_projects": [fakeMalformed("not-json")] }
  });
  const client = new OperationClient(transport, runtime, "desktop");

  await assert.rejects(
    client.operation("memory.list_projects"),
    (error: unknown) => error instanceof OperationError && error.code === "protocol"
  );
});

test("the fake carrier enforces its exact project binding", async () => {
  const transport = new FakeMemoryTransport({
    projectId: FIXTURE_PROJECT_ID,
    responses: { "memory.list_docs": [fakeSuccess([fixtureDocument])] }
  });
  const client = new OperationClient(transport, runtime, "desktop");

  await assert.rejects(
    client.operation("memory.list_docs", { projectId: "some-other-project" }),
    (error: unknown) => error instanceof OperationError && error.code === "forbidden"
  );
});

test("a lost mutation response becomes outcome-unknown instead of a definite failure", async () => {
  const transport = new FakeMemoryTransport({
    projectId: FIXTURE_PROJECT_ID,
    responses: { "memory.update_doc": [fakeTransportError()] }
  });
  const client = new OperationClient(transport, runtime, "desktop");

  await assert.rejects(
    client.operation("memory.update_doc", {
      projectId: FIXTURE_PROJECT_ID,
      documentId: fixtureDocument.id,
      title: "Retained fictional title"
    }),
    (error: unknown) => error instanceof OperationError && error.code === "outcome_unknown"
  );
});
