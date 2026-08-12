import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { markPrincipalAuthenticated } from "@zharwing/memory-core";
import { projectStructuredResult } from "@zharwing/memory-privacy";
import { MemoryService } from "../memory-service.js";

test("search visibility joins on entity type and id", async (t) => {
  const memoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-search-collision-"));
  const authorityStateRoot = path.join(path.dirname(memoryRoot), `${path.basename(memoryRoot)}-authority`);
  t.after(() => Promise.all([
    fs.rm(memoryRoot, { recursive: true, force: true }),
    fs.rm(authorityStateRoot, { recursive: true, force: true })
  ]).then(() => undefined));
  const service = new MemoryService({
    memoryRoot,
    authorityStateRoot,
    authorityKey: Buffer.alloc(32, 11)
  });
  const preview = await service.prepareProjectCreation({
    projectName: "Search Collision",
    createPointerFile: false
  });
  const project = await service.createProject({ preview });
  const document = await service.createDocument({
    projectId: project.id,
    title: "Private collision document",
    type: "investigation",
    body: "SEARCH_VISIBILITY_COLLISION_CANARY",
    visibility: "never-send"
  });

  const proposalDirectory = path.join(project.memoryRoot, "inbox", "proposed-updates");
  await fs.mkdir(proposalDirectory, { recursive: true });
  await fs.writeFile(path.join(proposalDirectory, "same-id.json"), JSON.stringify({
    id: document.id,
    projectId: project.id,
    type: "task",
    status: "pending",
    visibility: "ai-eligible",
    sourceKind: "manual",
    created: "2026-08-12T12:00:00.000Z",
    confidence: "medium",
    affectedFiles: [],
    proposedPatch: "unrelated proposal",
    reason: "unrelated"
  }), "utf8");

  const results = await service.search({
    projectId: project.id,
    query: "SEARCH_VISIBILITY_COLLISION_CANARY"
  });
  const privateDocument = results.find(
    (result) => result.type === "document" && result.id === document.id
  );
  assert.ok(privateDocument);
  assert.equal(privateDocument.visibility, "never-send");
  assert.equal(
    results.find((result) => result.type === "proposed-update" && result.id === document.id),
    undefined
  );
});

test("same-type duplicate ids cannot acquire agent visibility", async (t) => {
  const memoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-search-duplicate-"));
  const authorityStateRoot = path.join(path.dirname(memoryRoot), `${path.basename(memoryRoot)}-authority`);
  t.after(() => Promise.all([
    fs.rm(memoryRoot, { recursive: true, force: true }),
    fs.rm(authorityStateRoot, { recursive: true, force: true })
  ]).then(() => undefined));
  const service = new MemoryService({
    memoryRoot,
    authorityStateRoot,
    authorityKey: Buffer.alloc(32, 12)
  });
  const preview = await service.prepareProjectCreation({
    projectName: "Same Type Collision",
    createPointerFile: false
  });
  const project = await service.createProject({ preview });
  const document = await service.createDocument({
    projectId: project.id,
    title: "Duplicate ownership canary",
    type: "investigation",
    body: "SAME_TYPE_DUPLICATE_NO_AGENT_CANARY",
    visibility: "ai-eligible"
  });
  await fs.copyFile(
    document.filePath,
    path.join(path.dirname(document.filePath), "duplicate-same-id.md")
  );

  const results = await service.search({
    projectId: project.id,
    query: "SAME_TYPE_DUPLICATE_NO_AGENT_CANARY"
  });
  const duplicates = results.filter(
    (result) => result.type === "document" && result.id === document.id
  );
  assert.equal(duplicates.length, 2);
  assert.ok(duplicates.every((result) => result.visibility === undefined));

  const projected = projectStructuredResult(results, {
    principal: markPrincipalAuthenticated({
      principalId: "search-agent",
      sessionId: "search-agent-session",
      sessionOwner: "search-agent-owner",
      audience: "agent",
      operations: ["memory.search"],
      projectId: project.id,
      issuedAt: "2026-08-12T10:00:00.000Z",
      expiresAt: "2026-08-12T11:00:00.000Z",
      authorityEpoch: 1,
      policyDigest: "sha256:search-test",
      rotationId: "search-rotation",
      revocationId: "search-revocation"
    }),
    projectId: project.id,
    surface: "agent",
    policy: project.privacyPolicy,
    profile: "hardened-local",
    operation: "memory.search"
  });
  assert.equal(projected.allowed, true);
  assert.doesNotMatch(JSON.stringify(projected.data), /SAME_TYPE_DUPLICATE_NO_AGENT_CANARY/);
});
