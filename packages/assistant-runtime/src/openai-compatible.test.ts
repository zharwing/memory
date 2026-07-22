import assert from "node:assert/strict";
import { test } from "node:test";
import { callAiProviderJson, callOpenAiCompatibleJson, checkAiProvider } from "./openai-compatible.js";

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

test("callAiProviderJson uses LM Studio json_schema response format", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestBody: any;
  globalThis.fetch = (async (input, init) => {
    const url = requestUrl(input);
    if (url === "http://127.0.0.1:1234/v1/chat/completions") {
      requestBody = requestJsonBody(init);
      return jsonResponse({
        model: "local-json-model",
        choices: [{ message: { content: '{"ok":true}' } }]
      });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await callAiProviderJson<{ ok: boolean }>(
    {
      providerKind: "lm-studio",
      endpoint: "http://127.0.0.1:1234/v1",
      model: "local-json-model"
    },
    [{ role: "user", content: "Return JSON." }]
  );

  assert.equal(result.value.ok, true);
  assert.equal(requestBody.response_format.type, "json_schema");
  assert.equal(requestBody.response_format.json_schema.name, "zharwing_memory_json_response");
  assert.equal(requestBody.response_format.json_schema.schema.type, "object");
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

test("checkAiProvider detects LM Studio models from the native REST API", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body?: unknown }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = requestUrl(input);
    calls.push({ url, body: requestJsonBody(init) });
    if (url === "http://127.0.0.1:1234/api/v1/models") {
      return jsonResponse({
        models: [
          {
            type: "llm",
            key: "uncategorized",
            display_name: "Mistral Nemo Thinking",
            loaded_instances: [{ id: "uncategorized" }]
          },
          {
            type: "llm",
            key: "gemma-4-e4b-it",
            display_name: "Gemma 4 E4B Instruct",
            loaded_instances: []
          },
          {
            type: "embedding",
            key: "text-embedding-nomic-embed-text-v1.5",
            display_name: "Nomic Embed Text v1.5",
            loaded_instances: []
          }
        ]
      });
    }
    if (url === "http://127.0.0.1:1234/v1/chat/completions") {
      assert.equal((calls.at(-1)?.body as any).model, "uncategorized");
      return jsonResponse({
        model: "uncategorized",
        choices: [{ message: { content: '{"ok":true,"message":"ready"}' } }]
      });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await checkAiProvider({
    providerKind: "lm-studio",
    endpoint: "http://127.0.0.1:1234/v1",
    jsonMode: false
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, "uncategorized");
  assert.equal(result.modelDisplayName, "Mistral Nemo Thinking");
  assert.deepEqual(result.availableModels, ["uncategorized", "gemma-4-e4b-it"]);
  assert.deepEqual(calls.map((call) => call.url), [
    "http://127.0.0.1:1234/api/v1/models",
    "http://127.0.0.1:1234/v1/chat/completions"
  ]);
});

test("checkAiProvider retries LM Studio reasoning-only responses", async (t) => {
  const originalFetch = globalThis.fetch;
  let chatCalls = 0;
  globalThis.fetch = (async (input, init) => {
    const url = requestUrl(input);
    if (url === "http://127.0.0.1:1234/api/v1/models") {
      return jsonResponse({
        models: [
          {
            type: "llm",
            key: "llm",
            display_name: "Local Thinking Model",
            loaded_instances: [{ id: "llm" }]
          }
        ]
      });
    }
    if (url === "http://127.0.0.1:1234/v1/chat/completions") {
      chatCalls += 1;
      const body = requestJsonBody(init) as any;
      assert.equal(body.max_tokens >= 512, true);
      if (chatCalls === 1) {
        return jsonResponse({
          model: "llm",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: " ",
                reasoning_content: "**Analyzing the request**"
              },
              finish_reason: "length"
            }
          ]
        });
      }
      return jsonResponse({
        model: "llm",
        choices: [{ message: { content: '{"ok":true,"message":"ready"}' } }]
      });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await checkAiProvider({
    providerKind: "lm-studio",
    endpoint: "http://127.0.0.1:1234/v1",
    jsonMode: false
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, "llm");
  assert.equal(chatCalls, 2);
});

test("checkAiProvider uses Ollama native tags and chat endpoints", async (t) => {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = requestUrl(input);
    bodies.push(requestJsonBody(init));
    if (url === "http://127.0.0.1:11434/api/tags") {
      return jsonResponse({ models: [{ name: "llama3.2:latest" }] });
    }
    if (url === "http://127.0.0.1:11434/api/chat") {
      const body = bodies.at(-1) as any;
      assert.equal(body.model, "llama3.2:latest");
      assert.equal(body.stream, false);
      assert.equal(body.format, "json");
      assert.equal(body.options.temperature, 0);
      return jsonResponse({
        model: "llama3.2:latest",
        message: { content: '{"ok":true,"message":"ready"}' }
      });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await checkAiProvider({
    providerKind: "ollama",
    endpoint: "http://127.0.0.1:11434"
  });

  assert.equal(result.ok, true);
  assert.equal(result.endpoint, "http://127.0.0.1:11434/api/chat");
  assert.equal(result.model, "llama3.2:latest");
  assert.deepEqual(result.availableModels, ["llama3.2:latest"]);
});

test("checkAiProvider uses Anthropic models and messages endpoints", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; headers: Headers; body?: any }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = requestUrl(input);
    const headers = new Headers(init?.headers);
    const body = requestJsonBody(init);
    requests.push({ url, headers, body });
    assert.equal(headers.get("x-api-key"), "test-key");
    assert.equal(headers.get("anthropic-version"), "2023-06-01");
    if (url === "https://api.anthropic.com/v1/models") {
      return jsonResponse({ data: [{ id: "claude-sonnet-test" }] });
    }
    if (url === "https://api.anthropic.com/v1/messages") {
      const messageBody = body as any;
      assert.equal(messageBody.model, "claude-sonnet-test");
      assert.equal(messageBody.system, "Connectivity test. Do not explain. Do not think step by step. Return only the exact JSON object requested.");
      assert.deepEqual(messageBody.messages, [{ role: "user", content: 'Reply with exactly this JSON and nothing else: {"ok":true,"message":"ready"}' }]);
      return jsonResponse({
        model: "claude-sonnet-test",
        content: [{ type: "text", text: '{"ok":true,"message":"ready"}' }]
      });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await checkAiProvider({
    providerKind: "anthropic",
    endpoint: "https://api.anthropic.com",
    apiKey: "test-key"
  });

  assert.equal(result.ok, true);
  assert.equal(result.endpoint, "https://api.anthropic.com/v1/messages");
  assert.equal(result.model, "claude-sonnet-test");
  assert.deepEqual(requests.map((request) => request.url), [
    "https://api.anthropic.com/v1/models",
    "https://api.anthropic.com/v1/messages"
  ]);
});

test("checkAiProvider rejects Codex as a provider endpoint", async () => {
  await assert.rejects(
    checkAiProvider({
      providerKind: "codex",
      endpoint: "http://127.0.0.1:1234/v1",
      model: "codex"
    }),
    /Codex is not a standalone AI provider endpoint/
  );
});

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestJsonBody(init: RequestInit | undefined): unknown {
  if (!init?.body) return undefined;
  return JSON.parse(String(init.body));
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
