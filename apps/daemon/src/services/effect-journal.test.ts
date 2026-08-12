import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { OperationEffectJournal, type OperationEffectIdentity } from "./effect-journal.js";

const KEY = Buffer.alloc(32, 5);
const NAMESPACE = "d".repeat(64);

test("effect receipts survive restart without persisting caller identity or result bytes", async (t) => {
  const stateRoot = await tempRoot(t);
  const first = journal(stateRoot);
  const identity = effectIdentity();
  assert.deepEqual(first.claim(identity, "claim-a"), { kind: "claimed" });
  assert.equal(first.complete("claim-a"), true);

  const stored = await fs.readFile(path.join(stateRoot, "operation-effects.jsonl"), "utf8");
  assert.equal(stored.includes(identity.sessionOwner), false);
  assert.equal(stored.includes(identity.idempotencyKey), false);
  assert.equal(stored.includes("private projected result"), false);

  const restarted = journal(stateRoot);
  assert.deepEqual(restarted.claim(identity, "claim-b"), {
    kind: "outcome-unknown",
    state: "complete"
  });
  assert.deepEqual(restarted.claim({ ...identity, inputDigest: "b".repeat(64) }, "claim-c"), {
    kind: "conflict"
  });
});

test("stable owners and project generations partition effect identities", async (t) => {
  const stateRoot = await tempRoot(t);
  const effects = journal(stateRoot);
  const identity = effectIdentity();
  assert.deepEqual(effects.claim(identity, "claim-agent"), { kind: "claimed" });
  assert.equal(effects.complete("claim-agent"), true);
  assert.deepEqual(effects.claim({
    ...identity,
    sessionOwner: "different-owner"
  }, "claim-other-owner"), { kind: "claimed" });
  assert.deepEqual(effects.claim({
    ...identity,
    projectGeneration: "f".repeat(64)
  }, "claim-new-generation"), { kind: "claimed" });
});

test("the default durable horizon accepts more than 512 completed identities", async (t) => {
  const effects = journal(await tempRoot(t));
  for (let index = 0; index < 513; index += 1) {
    const claimId = `claim-${index}`;
    assert.deepEqual(effects.claim({
      ...effectIdentity(),
      idempotencyKey: `effect-key-${String(index).padStart(8, "0")}`
    }, claimId), { kind: "claimed" });
    assert.equal(effects.complete(claimId), true);
  }
});

test("in-flight receipts survive restart and released claims remain input bound", async (t) => {
  const stateRoot = await tempRoot(t);
  const identity = effectIdentity();
  assert.deepEqual(journal(stateRoot).claim(identity, "claim-a"), { kind: "claimed" });
  assert.deepEqual(journal(stateRoot).claim(identity, "claim-b"), {
    kind: "outcome-unknown",
    state: "in-flight"
  });

  const releasedRoot = path.join(stateRoot, "released");
  const released = journal(releasedRoot);
  assert.deepEqual(released.claim(identity, "claim-c"), { kind: "claimed" });
  assert.equal(released.release("claim-c"), true);
  assert.deepEqual(journal(releasedRoot).claim(identity, "claim-d"), { kind: "claimed" });
  assert.equal(journal(releasedRoot).release("claim-d"), true);
  assert.deepEqual(
    journal(releasedRoot).claim({ ...identity, inputDigest: "c".repeat(64) }, "claim-e"),
    { kind: "conflict" }
  );
});

test("forged corrupt oversized and over-capacity journals fail closed", async (t) => {
  const root = await tempRoot(t);
  const corruptRoot = path.join(root, "corrupt");
  const corrupt = journal(corruptRoot);
  assert.deepEqual(corrupt.claim(effectIdentity(), "claim-a"), { kind: "claimed" });
  await fs.appendFile(path.join(corruptRoot, "operation-effects.jsonl"), `${JSON.stringify({
    schema: "zharwing.operation-effects.v1",
    namespace: NAMESPACE,
    scopeDigest: "0".repeat(64),
    inputDigest: "a".repeat(64),
    claimId: "forged",
    event: "complete-receipt",
    recordedAt: "2026-08-12T12:00:00.000Z",
    mac: "0".repeat(64)
  })}\n`, "utf8");
  assert.deepEqual(corrupt.claim({ ...effectIdentity(), idempotencyKey: "effect-key-corrupt" }, "claim-b"), {
    kind: "unavailable"
  });

  const oversizedRoot = path.join(root, "oversized");
  await fs.mkdir(oversizedRoot);
  await fs.writeFile(path.join(oversizedRoot, "operation-effects.jsonl"), Buffer.alloc(1_025, 1));
  assert.deepEqual(journal(oversizedRoot, { maximumJournalBytes: 1_024 }).claim(effectIdentity(), "claim-c"), {
    kind: "unavailable"
  });

  const capacityRoot = path.join(root, "capacity");
  const bounded = journal(capacityRoot, { maximumIdentities: 1 });
  assert.deepEqual(bounded.claim(effectIdentity(), "claim-d"), { kind: "claimed" });
  assert.deepEqual(bounded.claim({ ...effectIdentity(), idempotencyKey: "effect-key-second" }, "claim-e"), {
    kind: "unavailable"
  });
});

test("a linked operation effect state root is rejected", async (t) => {
  const root = await tempRoot(t);
  const actual = path.join(root, "actual");
  const linked = path.join(root, "linked");
  await fs.mkdir(actual);
  try {
    await fs.symlink(actual, linked, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return;
    throw error;
  }
  assert.deepEqual(journal(linked).claim(effectIdentity(), "claim-a"), { kind: "unavailable" });
});

function journal(
  stateRoot: string,
  overrides: Partial<{ maximumIdentities: number; maximumJournalBytes: number }> = {}
): OperationEffectJournal {
  return new OperationEffectJournal({
    stateRoot,
    key: KEY,
    namespace: NAMESPACE,
    now: () => new Date("2026-08-12T12:00:00.000Z"),
    ...overrides
  });
}

function effectIdentity(): OperationEffectIdentity {
  return {
    sessionOwner: "stable-agent-owner",
    projectId: "project-a",
    projectGeneration: "e".repeat(64),
    operation: "memory.update_semantic_graph_settings",
    idempotencyKey: "effect-key-stable",
    inputDigest: "a".repeat(64)
  };
}

async function tempRoot(t: TestContext): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-operation-effects-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
