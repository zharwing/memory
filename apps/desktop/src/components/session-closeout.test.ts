import assert from "node:assert/strict";
import { test } from "node:test";
import { executeSessionCloseout } from "./session-closeout.js";

test("session closeout trusts the returned closed result instead of a stale list", async () => {
  const result = await executeSessionCloseout({
    sessions: {
      async closeSession(sessionId, summary, includeInGraph) {
        assert.equal(sessionId, "session-1");
        assert.equal(summary, "Finished the work.");
        return { id: sessionId, status: "closed", includeInGraph: Boolean(includeInGraph) };
      }
    },
    sessionId: "session-1",
    summary: "Finished the work.",
    includeInGraph: true
  });

  assert.equal(result?.status, "closed");
  assert.equal(result?.includeInGraph, true);
});

test("session closeout keeps the dialog open for missing or mismatched outcomes", async () => {
  const missing = await executeSessionCloseout({
    sessions: { closeSession: async () => undefined },
    sessionId: "session-1",
    summary: "Keep this draft.",
    includeInGraph: false
  });
  assert.equal(missing, undefined);

  const mismatched = await executeSessionCloseout({
    sessions: {
      closeSession: async () => ({
        id: "session-1",
        status: "closed",
        includeInGraph: false
      })
    },
    sessionId: "session-1",
    summary: "Keep this draft.",
    includeInGraph: true
  });
  assert.equal(mismatched, undefined);
});
