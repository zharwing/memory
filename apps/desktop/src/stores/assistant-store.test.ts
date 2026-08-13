import assert from "node:assert/strict";
import test from "node:test";
import type { MemoryClient } from "@zharwing/memory-api-client";
import { ProjectScopeCoordinator } from "../application/project-scope/project-scope-coordinator.js";
import { AssistantStore } from "./assistant-store.js";

test("provider-secret mutations reuse their operation identity as the idempotency key", async () => {
  const requests: Array<{
    name: string;
    input: Record<string, unknown>;
    options: { idempotencyKey?: string; signal?: AbortSignal };
  }> = [];
  const client = {
    async operation(
      name: string,
      input: Record<string, unknown>,
      options: { idempotencyKey?: string; signal?: AbortSignal } = {}
    ) {
      requests.push({ name, input, options });
      return name === "memory.clear_provider_secret"
        ? { configured: false, providerKind: "openai", revision: null, updatedAt: null }
        : {
            configured: true,
            providerKind: "openai",
            revision: "provider-secret-revision-1",
            updatedAt: "2031-04-05T12:00:00.000Z"
          };
    }
  } as unknown as MemoryClient;
  const scope = new ProjectScopeCoordinator();
  scope.activate("project-a");
  const store = new AssistantStore(client, scope, {
    refreshProjects: async () => undefined,
    refreshProjectSummary: async () => undefined
  }, {
    createId: (prefix) => `${prefix}:stable-test-id`,
    now: () => "2031-04-05T12:00:00.000Z"
  });

  assert.equal(await store.saveProviderSecret("openai", "synthetic-provider-secret"), true);
  assert.equal(await store.clearProviderSecret(), true);

  assert.equal(requests[0]?.name, "memory.set_provider_secret");
  assert.equal(
    requests[0]?.options.idempotencyKey,
    "operation:save-provider-secret:stable-test-id"
  );
  assert.equal(requests[1]?.name, "memory.clear_provider_secret");
  assert.equal(
    requests[1]?.options.idempotencyKey,
    "operation:clear-provider-secret:stable-test-id"
  );
  assert.equal(requests[0]?.options.signal, scope.captureScope()?.signal);
  assert.equal(requests[1]?.options.signal, scope.captureScope()?.signal);
  scope.dispose();
});
