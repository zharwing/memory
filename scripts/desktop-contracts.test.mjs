import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("desktop project routes preserve project scope and URL suffixes", async () => {
  const routes = await importTypeScriptModule("apps/desktop/src/utils/routes.ts");

  assert.equal(routes.projectIdFromPathname("/p/project%20one/dashboard"), "project one");
  assert.equal(routes.projectIdFromPathname("/dashboard"), undefined);
  assert.equal(routes.projectPath("project one", "/docs?filter=draft"), "/p/project%20one/library/docs?filter=draft");
  assert.equal(routes.projectPath(undefined, "/docs"), "/docs");
  assert.equal(routes.appPathFromPathname("/p/project-one/work/sessions"), "/sessions");
});

test("desktop document filters keep imported and starter-draft behavior stable", async () => {
  const documents = await importTypeScriptModule("apps/desktop/src/utils/documents.ts");
  const docs = [
    { id: "draft", status: "draft", filePath: "overview.md" },
    { id: "imported", status: "active", importProfile: "markdown-memory" },
    { id: "active", status: "active", filePath: "docs/active.md" }
  ];

  assert.deepEqual(documents.filterDocuments(docs, "draft").map((doc) => doc.id), ["draft"]);
  assert.deepEqual(documents.filterDocuments(docs, "imported").map((doc) => doc.id), ["imported"]);
  assert.equal(documents.isStarterDraftDoc(docs[0]), true);
  assert.equal(documents.isStarterDraftDoc(docs[2]), false);
});

test("desktop route table covers critical workflows and loads screens lazily", () => {
  const app = readFileSync(path.join(repoRoot, "apps/desktop/src/App.tsx"), "utf8");
  const routePaths = new Set([...app.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]));
  const required = [
    "/setup",
    "/projects",
    "/dashboard",
    "/current-work",
    "/sessions",
    "/docs",
    "/graph",
    "/context",
    "/import",
    "/search",
    "/trash",
    "/p/:projectId/dashboard",
    "/p/:projectId/library/docs",
    "/p/:projectId/settings/assistant"
  ];

  for (const route of required) assert.equal(routePaths.has(route), true, `missing desktop route: ${route}`);
  assert.match(app, /lazyScreen\(\(\) => import\(/);
  assert.doesNotMatch(app, /from "\.\/screens\/index\.js"/);
});

async function importTypeScriptModule(relativePath) {
  const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    },
    fileName: relativePath
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}
