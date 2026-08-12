import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENT_RESULT_SCHEMAS,
  agentResultSchemaRegistryIsComplete,
  parseAgentOperationResult
} from "./agent-results.js";
import { AGENT_OPERATIONS } from "./operation-registry.js";

const completeness = {
  status: "complete",
  excludedItems: 0,
  redactions: 0,
  truncatedItems: 0
} as const;

function projection(data: unknown) {
  return {
    schema: "zharwing.agent-projection.v1",
    status: "ok",
    data,
    completeness
  };
}

function sessionSummary(extra: Record<string, unknown> = {}) {
  return {
    id: "session-a",
    projectId: "project-a",
    status: "active",
    visibility: "ai-eligible",
    taskTitle: "Contract work",
    started: "2026-08-12T10:00:00.000Z",
    updated: "2026-08-12T10:01:00.000Z",
    topics: [],
    nextSteps: [],
    blockers: [],
    checkpointCount: 0,
    totalTouchedFiles: 0,
    workstreamIds: [],
    includeInGraph: true,
    revision: "revision-a",
    ...extra
  };
}

test("the public result registry covers exactly every registered agent operation", () => {
  assert.equal(agentResultSchemaRegistryIsComplete(), true);
  assert.deepEqual(Object.keys(AGENT_RESULT_SCHEMAS).sort(), [...AGENT_OPERATIONS].sort());
});

test("search rejects an unregistered future private field", () => {
  assert.throws(() => parseAgentOperationResult("memory.search", projection([{
    id: "doc-a",
    projectId: "project-a",
    type: "document",
    title: "Visible title",
    visibility: "ai-eligible",
    snippet: "Visible snippet",
    score: 1,
    futurePrivateField: "must-not-cross"
  }])), /futurePrivateField/);
});

test("session detail rejects unknown nested session fields", () => {
  assert.throws(() => parseAgentOperationResult("memory.get_session_detail", projection({
    schema: "zharwing.memory.session-detail.v1",
    session: sessionSummary({ futurePrivateField: "must-not-cross" })
  })), /futurePrivateField/);
});

test("startup rejects unknown nested derived fields", () => {
  assert.throws(() => parseAgentOperationResult("memory.get_startup_state", projection({
    schema: "zharwing.memory.startup.v2",
    projectStatus: "resolved",
    projectId: "project-a",
    recentSessions: [],
    workstreams: [],
    counts: {
      recentSessionsReturned: 0,
      workstreamsReturned: 0,
      futurePrivateCount: 99
    },
    recommendedAction: "start-new",
    contextReadiness: "needs-session",
    safetyStatus: "needs-review",
    messageForClient: "Ready."
  })), /registered shape/);
});

test("bundle rejects unknown nested wire fields", () => {
  assert.throws(() => parseAgentOperationResult("memory.preview_context_bundle", {
    schema: "zharwing.memory.bundle.v1",
    status: "ok",
    projectId: "project-a",
    created: "2026-08-12T10:00:00.000Z",
    budget: { maxTokens: 100, usedTokens: 0, truncated: false, futurePrivateBudget: 1 },
    sections: [],
    completeness,
    safetyStatus: "clean"
  }), /futurePrivateBudget/);
});
