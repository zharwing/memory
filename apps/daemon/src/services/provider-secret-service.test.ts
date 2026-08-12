import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ProviderSecretService } from "./provider-secret-service.js";

test("provider secrets are write-only, revision-bound, encrypted, and clearable", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zharwing-provider-secret-"));
  try {
    const service = new ProviderSecretService({
      namespace: "a".repeat(64),
      stateRoot: root,
      key: Buffer.alloc(32, 7),
      now: () => new Date("2026-01-02T03:04:05.000Z")
    });
    assert.deepEqual(service.status("project-a", "openai"), {
      configured: false,
      providerKind: "openai",
      revision: null,
      updatedAt: null
    });
    const created = service.set({
      projectId: "project-a",
      providerKind: "openai",
      secret: "SYNTHETIC_PROVIDER_CANARY"
    });
    assert.equal(created.configured, true);
    assert.equal(service.read("project-a", "openai"), "SYNTHETIC_PROVIDER_CANARY");
    assert.throws(() => service.set({
      projectId: "project-a",
      providerKind: "openai",
      secret: "blind-overwrite"
    }), /already configured/);
    assert.throws(() => service.set({
      projectId: "project-a",
      providerKind: "openai",
      secret: "wrong-revision",
      expectedRevision: "0".repeat(32)
    }), /revision conflict/);
    const rotated = service.set({
      projectId: "project-a",
      providerKind: "openai",
      secret: "ROTATED_SYNTHETIC_CANARY",
      expectedRevision: created.revision
    });
    assert.notEqual(rotated.revision, created.revision);
    assert.equal(service.read("project-a", "openai"), "ROTATED_SYNTHETIC_CANARY");
    const emitted = fs.readdirSync(root, { recursive: true })
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => path.join(root, entry))
      .filter((entry) => fs.statSync(entry).isFile())
      .map((entry) => fs.readFileSync(entry))
      .reduce((all, bytes) => Buffer.concat([all, bytes]), Buffer.alloc(0))
      .toString("utf8");
    assert.doesNotMatch(emitted, /SYNTHETIC_PROVIDER_CANARY|ROTATED_SYNTHETIC_CANARY/);
    assert.equal(service.clear({
      projectId: "project-a",
      providerKind: "openai",
      expectedRevision: rotated.revision!
    }).configured, false);
    assert.equal(service.read("project-a", "openai"), undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
