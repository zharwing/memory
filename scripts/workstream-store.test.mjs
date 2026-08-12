import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "apps/desktop/src/stores/workstream-store.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const moduleUrl = dataModuleUrl(
  compiled
    .replaceAll('from "mobx"', `from "${dataModuleUrl("export function makeAutoObservable() {}")}"`)
    .replaceAll(
      'from "../application/operations/operation-state.js"',
      `from "${typescriptModuleUrl("apps/desktop/src/application/operations/operation-state.ts", {
        mobx: "export function makeAutoObservable() {}",
        "@zharwing/memory-core": `
          export function createPublicError() {
            return { code: "INTERNAL", category: "internal", messageId: "operation.internal", retry: "never" };
          }
        `,
        "../resources/resource-state.js": `
          export function toPublicError(error) {
            return error && error.publicError
              ? error.publicError
              : { code: "INTERNAL", category: "internal", messageId: "operation.internal", retry: "never" };
          }
        `
      })}"`
    )
    .replaceAll(
      'from "../application/resources/resource-state.js"',
      `from "${typescriptModuleUrl("apps/desktop/src/application/resources/resource-state.ts", {
        mobx: "export function makeAutoObservable() {}",
        "@zharwing/memory-core": `
          export function createPublicError() {
            return { code: "INTERNAL", category: "internal", messageId: "operation.internal", retry: "never" };
          }
          export function isPublicError(value) {
            return Boolean(value && typeof value === "object" && typeof value.messageId === "string");
          }
        `
      })}"`
    )
    .replaceAll(
      'from "../application/operations/destructive-operation.js"',
      `from "${dataModuleUrl(`
        export async function executeConfirmedDestructiveOperation(client, projectId, operation, input, options) {
          return client.operation(operation, input, options);
        }
      `)}"`
    )
);
const { WorkstreamStore } = await import(moduleUrl);

test("switching projects clears stale workstream selection and detail", async () => {
  let projectId = "project-a";
  const client = {
    async operation(method, args) {
      if (method === "memory.list_workstreams") {
        return args.projectId === "project-a"
          ? [{ id: "workstream-a", projectId: "project-a", name: "Release", status: "active" }]
          : [];
      }
      if (method === "memory.get_workstream_detail") {
        return { workstream: { id: args.workstreamId, projectId: args.projectId, name: "Release", status: "active" } };
      }
      throw new Error(`Unexpected method: ${method}`);
    }
  };
  const store = createStore(client, () => projectId);

  await store.load();
  await store.loadDetail();
  assert.equal(store.selectedWorkstreamId, "workstream-a");
  assert.equal(store.detail?.workstream.id, "workstream-a");

  projectId = "project-b";
  await store.load();

  assert.deepEqual(store.list, []);
  assert.equal(store.selectedWorkstreamId, "");
  assert.equal(store.detail, undefined);
  assert.equal(store.error, "");
});

test("clear removes every project-scoped workstream value", async () => {
  const client = {
    async operation() {
      return [{ id: "workstream-a", projectId: "project-a", name: "Release", status: "active" }];
    }
  };
  const store = createStore(client, () => "project-a");

  await store.load();
  store.clear();

  assert.deepEqual(store.list, []);
  assert.equal(store.selectedWorkstreamId, "");
  assert.equal(store.detail, undefined);
});

test("an in-flight detail response cannot restore the previous project's detail", async () => {
  let projectId = "project-a";
  const detailRequest = deferred();
  const client = {
    async operation(method, args) {
      if (method === "memory.list_workstreams") {
        return args.projectId === "project-a"
          ? [{ id: "workstream-a", projectId: "project-a", name: "Release", status: "active" }]
          : [];
      }
      if (method === "memory.get_workstream_detail") return detailRequest.promise;
      throw new Error(`Unexpected method: ${method}`);
    }
  };
  const store = createStore(client, () => projectId);

  await store.load();
  const pendingDetail = store.loadDetail();
  projectId = "project-b";
  await store.load();
  detailRequest.resolve({
    workstream: { id: "workstream-a", projectId: "project-a", name: "Release", status: "active" }
  });
  await pendingDetail;

  assert.equal(store.selectedWorkstreamId, "");
  assert.equal(store.detail, undefined);
  assert.equal(store.error, "");
});

test("an in-flight detail failure cannot restore the previous project's error", async () => {
  let projectId = "project-a";
  const detailRequest = deferred();
  const client = {
    async operation(method, args) {
      if (method === "memory.list_workstreams") {
        return args.projectId === "project-a"
          ? [{ id: "workstream-a", projectId: "project-a", name: "Release", status: "active" }]
          : [];
      }
      if (method === "memory.get_workstream_detail") return detailRequest.promise;
      throw new Error(`Unexpected method: ${method}`);
    }
  };
  const store = createStore(client, () => projectId);

  await store.load();
  const pendingDetail = store.loadDetail();
  projectId = "project-b";
  await store.load();
  detailRequest.reject(new Error("stale project-a failure"));
  await pendingDetail;

  assert.equal(store.detail, undefined);
  assert.equal(store.error, "");
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createStore(client, currentProjectId) {
  let generation = 0;
  let lastProjectId = "";
  let controller = new AbortController();
  let token;
  const captureScope = () => {
    const projectId = currentProjectId();
    if (!projectId) return undefined;
    if (!token || lastProjectId !== projectId) {
      controller.abort();
      controller = new AbortController();
      generation += 1;
      lastProjectId = projectId;
      token = { projectId, generation, signal: controller.signal };
    }
    return token;
  };
  const scope = {
    currentProjectId,
    currentProjectWorkingDirectory: () => undefined,
    captureScope,
    isScopeCurrent: (candidate) => candidate === captureScope() && !candidate.signal.aborted,
    onScopeReset: () => () => undefined
  };
  const coordinator = {
    refreshProjectSummary: async () => undefined,
    refreshGraph: async () => undefined,
    refreshTrash: async () => undefined
  };
  let nextId = 0;
  const runtime = {
    createId: (prefix) => `${prefix}:${++nextId}`,
    now: () => "2026-08-12T00:00:00.000Z"
  };
  return new WorkstreamStore(client, scope, coordinator, runtime);
}

function typescriptModuleUrl(relativePath, mocks) {
  let output = ts.transpileModule(
    fs.readFileSync(path.join(repoRoot, relativePath), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: relativePath
    }
  ).outputText;
  for (const [specifier, mockSource] of Object.entries(mocks)) {
    output = output.replaceAll(`from "${specifier}"`, `from "${dataModuleUrl(mockSource)}"`);
  }
  return dataModuleUrl(output);
}

function dataModuleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
