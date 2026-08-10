import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import ts from "typescript";

const source = fs.readFileSync(new URL("../apps/desktop/src/stores/workstream-store.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const testModule = { exports: {} };
const testRequire = (specifier) => {
  if (specifier === "mobx") {
    return {
      makeAutoObservable() {},
      runInAction(work) {
        return work();
      }
    };
  }
  throw new Error(`Unexpected runtime import: ${specifier}`);
};
new Function("require", "module", "exports", compiled)(testRequire, testModule, testModule.exports);
const { WorkstreamStore } = testModule.exports;

test("switching projects clears stale workstream selection and detail", async () => {
  let projectId = "project-a";
  const client = {
    async call(method, args) {
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
  const root = {
    projects: {
      get selectedProjectId() {
        return projectId;
      }
    }
  };
  const store = new WorkstreamStore(client, root);

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
  const root = { projects: { selectedProjectId: "project-a" } };
  const client = {
    async call() {
      return [{ id: "workstream-a", projectId: "project-a", name: "Release", status: "active" }];
    }
  };
  const store = new WorkstreamStore(client, root);

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
    async call(method, args) {
      if (method === "memory.list_workstreams") {
        return args.projectId === "project-a"
          ? [{ id: "workstream-a", projectId: "project-a", name: "Release", status: "active" }]
          : [];
      }
      if (method === "memory.get_workstream_detail") return detailRequest.promise;
      throw new Error(`Unexpected method: ${method}`);
    }
  };
  const root = {
    projects: {
      get selectedProjectId() {
        return projectId;
      }
    }
  };
  const store = new WorkstreamStore(client, root);

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
    async call(method, args) {
      if (method === "memory.list_workstreams") {
        return args.projectId === "project-a"
          ? [{ id: "workstream-a", projectId: "project-a", name: "Release", status: "active" }]
          : [];
      }
      if (method === "memory.get_workstream_detail") return detailRequest.promise;
      throw new Error(`Unexpected method: ${method}`);
    }
  };
  const root = {
    projects: {
      get selectedProjectId() {
        return projectId;
      }
    }
  };
  const store = new WorkstreamStore(client, root);

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
