import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectModel, type MemoryDocument } from "@zharwing/memory-core";
import { buildContextBundle } from "./builder.js";

test("buildContextBundle excludes never-send docs and redacts allowed secrets", () => {
  const project = createProjectModel({
    name: "Context Privacy Test",
    memoryRoot: "/tmp/zharwing-context-test"
  });
  const docs = [
    doc({
      id: "doc-overview",
      title: "Project Overview",
      type: "overview",
      body: "Public project overview for billing work."
    }),
    doc({
      id: "doc-redacted",
      title: "Pinned Connection Notes",
      visibility: "ai-pinned",
      body: "Example endpoint uses operator:anothersecret@example.com for documentation only."
    }),
    doc({
      id: "doc-never-send",
      title: "Never Send Architecture",
      type: "architecture-note",
      visibility: "never-send",
      body: "NEVER_SEND_CONTENT_MARKER"
    })
  ];

  const bundle = buildContextBundle({
    project,
    documents: docs,
    recentSessions: [],
    taskText: "billing architecture connection",
    requestedBy: "node-test"
  });

  assert.equal(bundle.includedItems.some((item) => item.id === "doc-overview"), true);
  assert.equal(bundle.includedItems.some((item) => item.id === "doc-redacted"), true);
  assert.equal(bundle.excludedItems.some((item) => item.id === "doc-never-send" && item.reason === "never-send"), true);
  assert.equal(bundle.markdown.includes("NEVER_SEND_CONTENT_MARKER"), false);
  assert.equal(bundle.markdown.includes("anothersecret"), false);
  assert.match(bundle.markdown, /\[REDACTED_BASIC_AUTH_URL\]/);
  assert.equal(bundle.redactions.length, 1);
  assert.equal(bundle.safetyStatus, "needs-review");
});

function doc(overrides: Partial<MemoryDocument> & Pick<MemoryDocument, "id" | "title" | "body">): MemoryDocument {
  return {
    id: overrides.id,
    projectId: "context-privacy-test",
    title: overrides.title,
    type: overrides.type || "scratch-note",
    status: overrides.status || "active",
    visibility: overrides.visibility || "ai-eligible",
    topics: overrides.topics || [],
    workstreamIds: overrides.workstreamIds || [],
    relatedTasks: overrides.relatedTasks || [],
    relatedFiles: overrides.relatedFiles || [],
    relatedSessions: overrides.relatedSessions || [],
    relatedDiagrams: overrides.relatedDiagrams || [],
    created: overrides.created || "2026-07-05T00:00:00.000Z",
    updated: overrides.updated || "2026-07-05T00:00:00.000Z",
    filePath: overrides.filePath || `docs/${overrides.id}.md`,
    body: overrides.body,
    format: overrides.format || "markdown"
  };
}
