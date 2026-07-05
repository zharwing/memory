import assert from "node:assert/strict";
import { test } from "node:test";
import { callOpenAiCompatibleJson } from "./openai-compatible.js";

test("callOpenAiCompatibleJson accepts array-form message content", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    model: "array-content-model",
    choices: [
      {
        message: {
          content: [
            { type: "text", text: '{"ok":true,' },
            { type: "text", text: '"message":"ready"}' }
          ]
        }
      }
    ]
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await callOpenAiCompatibleJson<{ ok: boolean; message: string }>(
    {
      endpoint: "http://127.0.0.1:1234/v1",
      model: "array-content-model",
      jsonMode: false
    },
    [{ role: "user", content: "Return JSON." }]
  );

  assert.equal(result.value.ok, true);
  assert.equal(result.value.message, "ready");
  assert.equal(result.model, "array-content-model");
});

test("callOpenAiCompatibleJson reports the empty first choice when content is missing", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    model: "empty-content-model",
    choices: [
      {
        message: {
          content: ""
        },
        finish_reason: "length"
      }
    ]
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    callOpenAiCompatibleJson(
      {
        endpoint: "http://127.0.0.1:1234/v1",
        model: "empty-content-model",
        jsonMode: false
      },
      [{ role: "user", content: "Return JSON." }]
    ),
    /finish_reason/
  );
});
