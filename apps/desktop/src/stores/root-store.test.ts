import assert from "node:assert/strict";
import test from "node:test";
import type { MemoryClient } from "@zharwing/memory-api-client";
import type { OperationName } from "@zharwing/memory-core";
import type { AppServices } from "../app/composition/ports.js";
import {
  fixtureProject,
  populatedOperationResults
} from "../testing/fixture-data.js";
import { RootStore } from "./root-store.js";

test("initialization applies the latest requested route and aborts all scope work on disposal", async () => {
  const projectA = { ...fixtureProject, id: "project-a", slug: "project-a", name: "Project A" };
  const projectB = { ...fixtureProject, id: "project-b", slug: "project-b", name: "Project B" };
  let resolveProjects: ((projects: typeof projectA[]) => void) | undefined;
  const projectList = new Promise<typeof projectA[]>((resolve) => {
    resolveProjects = resolve;
  });
  const observedProjectIds: string[] = [];
  const baseResults = populatedOperationResults();
  const client = {
    async operation(name: OperationName, input: Record<string, unknown> = {}) {
      if (name === "memory.list_projects") return projectList;
      if (typeof input.projectId === "string") observedProjectIds.push(input.projectId);
      return baseResults[name];
    }
  } as unknown as MemoryClient;
  const store = new RootStore(createServices(client));

  const firstRoute = store.initialize("project-a");
  const latestRoute = store.initialize("project-b");
  resolveProjects?.([projectA, projectB]);
  await Promise.all([firstRoute, latestRoute]);

  assert.equal(store.projects.selectedProjectId, "project-b");
  assert.ok(observedProjectIds.length > 0);
  assert.equal(observedProjectIds.every((projectId) => projectId === "project-b"), true);
  const projectToken = store.projectScope.captureScope();
  const applicationToken = store.applicationScope.captureScope();
  assert.ok(projectToken);
  assert.ok(applicationToken);

  store.dispose();

  assert.equal(projectToken.signal.aborted, true);
  assert.equal(applicationToken.signal.aborted, true);
  assert.equal(store.projectScope.captureScope(), undefined);
  assert.equal(store.applicationScope.captureScope(), undefined);
});

test("provider-secret status participates in recovery and is reloaded after a failure", async () => {
  const baseResults = populatedOperationResults();
  let providerStatusRequests = 0;
  let failProviderStatus = false;
  const client = {
    async operation(name: OperationName) {
      if (name === "memory.get_provider_secret_status") {
        providerStatusRequests += 1;
        if (failProviderStatus) throw new Error("synthetic provider status failure");
      }
      if (name === "memory.mcp_doctor") return { status: "healthy" };
      if (name === "memory.list_trash") return [];
      return baseResults[name];
    }
  } as unknown as MemoryClient;
  const store = new RootStore(createServices(client));
  await store.initialize(fixtureProject.id);
  await store.assistant.loadProviderSecretStatus("openai");
  assert.equal(providerStatusRequests, 1);

  failProviderStatus = true;
  await store.assistant.loadProviderSecretStatus("openai");
  assert.ok(store.assistant.providerSecretStatusResource.error);
  assert.notEqual(store.recoveryState.status, "ready");

  failProviderStatus = false;
  await store.recover();

  assert.equal(providerStatusRequests, 3);
  assert.equal(store.assistant.providerSecretStatusResource.error, undefined);
  assert.equal(store.assistant.providerSecretKind, "openai");
  assert.equal(store.recoveryState.status, "ready");
  store.dispose();
});

function createServices(memory: MemoryClient): Pick<
  AppServices,
  "memory" | "scheduler" | "clock" | "ids" | "preferences" | "browserSession"
> {
  let sequence = 0;
  const preferences = new Map<string, string>();
  return {
    memory,
    clock: { now: () => new Date("2031-04-05T12:00:00.000Z") },
    ids: { create: () => `root-store-test-${++sequence}` },
    preferences: {
      get: (key) => preferences.get(key),
      set: (key, value) => value === undefined
        ? void preferences.delete(key)
        : void preferences.set(key, value)
    },
    scheduler: {
      setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
      clearTimeout: (handle) => globalThis.clearTimeout(handle),
      setInterval: (callback, delayMs) => globalThis.setInterval(callback, delayMs),
      clearInterval: (handle) => globalThis.clearInterval(handle)
    }
  };
}
