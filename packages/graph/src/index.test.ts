import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_ASSISTANT_POLICY,
  DEFAULT_CONTEXT_POLICY,
  DEFAULT_MEMORY_WRITE_POLICY,
  DEFAULT_PRIVACY_POLICY,
  type MemoryDocument,
  type Project,
  type Session
} from "@zharwing/memory-core";
import { buildProjectGraph } from "./index.js";

test("the graph includes only sessions explicitly opted in", () => {
  const project: Project = {
    id: "project-1",
    name: "Graph visibility",
    slug: "graph-visibility",
    memoryRoot: "/memory",
    repos: [],
    created: "2026-07-22T00:00:00.000Z",
    updated: "2026-07-22T00:00:00.000Z",
    privacyPolicy: { ...DEFAULT_PRIVACY_POLICY },
    contextPolicy: { ...DEFAULT_CONTEXT_POLICY },
    assistantPolicy: { ...DEFAULT_ASSISTANT_POLICY },
    memoryWritePolicy: { ...DEFAULT_MEMORY_WRITE_POLICY }
  };
  const hidden = session({
    id: "hidden",
    taskTitle: "Routine checkpoint",
    touchedFiles: ["routine.ts"],
    includeInGraph: false
  });
  const included = session({
    id: "included",
    taskTitle: "Architecture milestone",
    touchedFiles: ["architecture.ts"],
    includeInGraph: true
  });

  const document: MemoryDocument = {
    id: "doc-1",
    projectId: project.id,
    title: "Architecture note",
    type: "architecture-note",
    status: "active",
    visibility: "ai-eligible",
    topics: [],
    workstreamIds: [],
    relatedTasks: [],
    relatedFiles: [],
    relatedSessions: [hidden.id, included.id],
    relatedDiagrams: [],
    created: "2026-07-22T00:00:00.000Z",
    updated: "2026-07-22T00:00:00.000Z",
    filePath: "/memory/architecture.md",
    body: "Architecture context."
  };
  const graph = buildProjectGraph({ project, sessions: [hidden, included], documents: [document] });
  const nodeIds = new Set(graph.nodes.map((node) => node.id));

  assert.equal(nodeIds.has("session:hidden"), false);
  assert.equal(nodeIds.has("task:routine checkpoint"), false);
  assert.equal(nodeIds.has("file:routine.ts"), false);
  assert.equal(nodeIds.has("session:included"), true);
  assert.equal(nodeIds.has("task:architecture milestone"), true);
  assert.equal(nodeIds.has("file:architecture.ts"), true);
  assert.equal(graph.edges.some((edge) => edge.from === "session:hidden" || edge.to === "session:hidden"), false);
  assert.equal(
    graph.edges.some((edge) => edge.from === "session:included" && edge.to === "doc:doc-1"),
    true
  );
});

function session(overrides: Partial<Session>): Session {
  return {
    id: "session",
    projectId: "project-1",
    repoPath: "/repo",
    workingDirectory: "/repo",
    status: "closed",
    started: "2026-07-22T00:00:00.000Z",
    updated: "2026-07-22T00:00:00.000Z",
    taskTitle: "Session",
    includeInGraph: false,
    topics: [],
    nextSteps: [],
    blockers: [],
    touchedFiles: [],
    workstreamIds: [],
    relatedDocs: [],
    relatedTasks: [],
    checkpoints: [],
    ...overrides
  };
}
