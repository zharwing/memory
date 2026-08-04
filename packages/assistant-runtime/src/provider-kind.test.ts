import assert from "node:assert/strict";
import { test } from "node:test";
import { providerKindFromAssistantRuntime } from "./provider-kind.js";

test("providerKindFromAssistantRuntime maps every known runtime", () => {
  assert.equal(providerKindFromAssistantRuntime("lm-studio"), "lm-studio");
  assert.equal(providerKindFromAssistantRuntime("ollama"), "ollama");
  assert.equal(providerKindFromAssistantRuntime("llama-cpp"), "llama-cpp");
  assert.equal(providerKindFromAssistantRuntime("app-managed-llamacpp"), "llama-cpp");
  assert.equal(providerKindFromAssistantRuntime("openai"), "openai");
  assert.equal(providerKindFromAssistantRuntime("anthropic"), "anthropic");
  assert.equal(providerKindFromAssistantRuntime("custom-openai-compatible"), "openai-compatible");
});

test("providerKindFromAssistantRuntime returns undefined for disabled or unknown runtimes", () => {
  assert.equal(providerKindFromAssistantRuntime("disabled"), undefined);
  assert.equal(providerKindFromAssistantRuntime(undefined), undefined);
  assert.equal(providerKindFromAssistantRuntime(""), undefined);
  assert.equal(providerKindFromAssistantRuntime("something-new"), undefined);
});
