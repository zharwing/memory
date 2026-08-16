import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");
const compiledRoot = process.env.ZHARWING_TEST_BUILD_ROOT
  ? path.resolve(process.env.ZHARWING_TEST_BUILD_ROOT)
  : repoRoot;

test("desktop typed routes preserve valid project scope and reject malformed links", async () => {
  const routes = await importTypeScriptModule("apps/desktop/src/app/routing/route-registry.ts");

  assert.equal(routes.projectIdFromRegisteredPath("/p/project-one/dashboard"), "project-one");
  assert.equal(routes.projectIdFromRegisteredPath("/dashboard"), undefined);
  assert.equal(
    routes.routePath("search", { projectId: "project-one", query: { q: "draft" } }),
    "/p/project-one/search?q=draft"
  );
  assert.deepEqual(routes.decodeRouteLocation("/p/project%20one/dashboard"), {
    status: "malformed",
    reason: "project"
  });
  assert.deepEqual(routes.decodeRouteLocation("/p/..%2Fother/dashboard"), {
    status: "malformed",
    reason: "encoding"
  });

  const routeFacade = readSource("apps/desktop/src/utils/routes.ts");
  assert.match(routeFacade, /from "\.\.\/app\/routing\/route-registry\.js"/);
  assert.doesNotMatch(routeFacade, /\b(?:projectPath|appPathFromPathname|projectIdFromPathname)\b/);
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

  const loadedDocument = {
    id: "list-read-id",
    projectId: "project-one",
    filePath: "C:\\memory\\project-one\\overview.md"
  };
  assert.equal(
    documents.findDocumentForSearchResult([loadedDocument], {
      id: "separate-search-read-id",
      projectId: "project-one",
      type: "document",
      path: "C:/memory/project-one/overview.md"
    }),
    loadedDocument
  );
});

test("Search and Documents share the document editing contract with a rendered fallback for unsupported Markdown", () => {
  const search = readSource("apps/desktop/src/screens/SearchScreen.tsx");
  const docs = readSource("apps/desktop/src/screens/DocsScreen.tsx");
  const host = readSource("apps/desktop/src/components/DocumentEditorHost.tsx");
  const editor = readSource("apps/desktop/src/components/DocumentEditorModal.tsx");
  const editorStyles = readSource("apps/desktop/src/styles/11-document-modal.css");

  assert.match(search, /resolveSearchTarget[\s\S]*searchTargetPath/);
  assert.match(docs, /<DocumentEditorHost[\s\S]*doc=\{editingDoc\}/);
  assert.match(host, /<DocumentEditorModal/);
  assert.match(editor, /markdown=\{body\}/);
  assert.match(editor, /onError=\{\(\) => dispatch\(\{ type: "rich-editor-failed" \}\)\}/);
  assert.match(editor, /richEditorFailed[\s\S]*<MarkdownPreview body=\{body\}/);
  assert.match(editorStyles, /\.document-editor-body \.mdx-rich-editor[\s\S]*--baseTextContrast: var\(--text\)/);
});

test("document editor reducer preserves drafts failures and tab behavior", async () => {
  const editor = await importTypeScriptModule("apps/desktop/src/components/document-editor-state.ts");
  const doc = { id: "doc-a", title: "Original", body: "# Original" };
  let state = editor.createDocumentEditorState(doc);

  state = editor.documentEditorReducer(state, { type: "change-mode", mode: "markdown" });
  state = editor.documentEditorReducer(state, { type: "change-title", title: "Draft title" });
  state = editor.documentEditorReducer(state, { type: "change-body", body: "# Draft body" });
  state = editor.documentEditorReducer(state, { type: "save-started" });
  state = editor.documentEditorReducer(state, { type: "save-failed" });
  state = editor.documentEditorReducer(state, { type: "save-finished" });
  assert.deepEqual(
    { mode: state.mode, title: state.title, body: state.body, localSaving: state.localSaving, saveFailed: state.saveFailed },
    { mode: "markdown", title: "Draft title", body: "# Draft body", localSaving: false, saveFailed: true }
  );

  state = editor.documentEditorReducer(state, { type: "open-discard-dialog" });
  state = editor.documentEditorReducer(state, { type: "discard-changes" });
  assert.deepEqual(
    { mode: state.mode, title: state.title, body: state.body, showDiscardDialog: state.showDiscardDialog },
    { mode: "preview", title: "Original", body: "# Original", showDiscardDialog: false }
  );

  state = editor.documentEditorReducer(state, { type: "rich-editor-failed" });
  assert.equal(state.richEditorFailed, true);
  state = editor.documentEditorReducer(state, {
    type: "reset-document",
    doc: { id: "doc-b", title: "Search result", body: "# Search result body" }
  });
  assert.deepEqual(
    { mode: state.mode, title: state.title, body: state.body, richEditorFailed: state.richEditorFailed },
    { mode: "preview", title: "Search result", body: "# Search result body", richEditorFailed: false }
  );
});

test("resource async projection retains only explicitly accepted prior content", async () => {
  const asyncState = await importTypeScriptModule("apps/desktop/src/components/async-resource-projection.ts");
  const scope = { projectId: "project-a" };
  const data = ["accepted"];
  const refreshing = asyncState.resourceStateToAsyncRegion({
    status: "refreshing",
    scope,
    requestId: "request-a",
    data,
    completeness: { kind: "complete" },
    lastSuccessAt: "2026-08-13T00:00:00.000Z"
  });
  assert.deepEqual(refreshing, { status: "refreshing", hasData: true, data });

  const partial = asyncState.resourceStateToAsyncRegion({
    status: "success",
    scope,
    data,
    completeness: { kind: "partial" },
    lastSuccessAt: "2026-08-13T00:00:00.000Z"
  });
  assert.deepEqual(partial, { status: "partial", hasData: true, data });

  const failure = {
    status: "failure",
    scope,
    error: { code: "internal" },
    previous: { scope, data, completeness: { kind: "complete" }, receivedAt: "2026-08-13T00:00:00.000Z" }
  };
  assert.deepEqual(asyncState.resourceStateToAsyncRegion(failure), { status: "error", hasData: false });
  assert.deepEqual(
    asyncState.resourceStateToAsyncRegion(failure, { retainPreviousOnFailure: true }),
    { status: "error", hasData: true, data }
  );
});

test("dashboard keeps an explicit zero graph snapshot for authoritative empty data", () => {
  const dashboard = readSource("apps/desktop/src/screens/DashboardScreen.tsx");

  assert.match(dashboard, /label="Graph snapshot"[\s\S]*empty=\{\([\s\S]*label="Nodes" value=\{0\}[\s\S]*label="Edges" value=\{0\}/);
});

test("modal stack is runtime-owned and enforces topmost focus behavior", () => {
  const modal = readSource("apps/desktop/src/components/Modal.tsx");
  const provider = readSource("apps/desktop/src/stores/store-context.tsx");
  assert.match(provider, /<LayerProvider>\{children\}<\/LayerProvider>/);
  assert.match(modal, /useLayerStack\(\)/);
  assert.match(modal, /layerStack\.push\(instanceId\)/);
  assert.match(modal, /layerStack\.remove\(instanceId\)/);
  assert.match(modal, /if \(!layerStack\.isTop\(instanceId\)\) return;/);
  assert.match(modal, /\(candidate \?\? panel\)\.focus\(\{ preventScroll: true \}\)/);
  assert.match(modal, /returnTarget\.focus\(\{ preventScroll: true \}\)/);
  assert.match(modal, /onKeyDown=\{containFocus\}/);
});

test("desktop route registry covers critical workflows and generates the route outlet", async () => {
  const app = readFileSync(path.join(repoRoot, "apps/desktop/src/App.tsx"), "utf8");
  const registry = await importTypeScriptModule("apps/desktop/src/app/routing/route-registry.ts");
  const entries = registry.registeredRouteEntries();
  const routePaths = new Set(entries.flatMap((entry) => {
    if (entry.kind === "wildcard") return [entry.path];
    if (entry.kind === "screen" && entry.legacyPath) return [entry.path, entry.legacyPath];
    return [entry.path];
  }));
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
  assert.equal(entries.filter((entry) => entry.kind === "wildcard").length, 1);
  assert.equal(entries.at(-1)?.kind, "wildcard");
  assert.match(app, /lazyScreen\(\(\) => import\(/);
  assert.match(app, /<RegisteredRouteOutlet screens=\{REGISTERED_SCREENS\}/);
  assert.doesNotMatch(app, /<Route\b|<Routes\b/);
  assert.doesNotMatch(app, /from "\.\/screens\/index\.js"/);
  const scopeGuard = app.indexOf("if (!routeScopeAccepted)");
  const registeredOutlet = app.lastIndexOf("<RegisteredRouteOutlet");
  assert.ok(scopeGuard >= 0 && scopeGuard < registeredOutlet, "route scope must be accepted before a project screen mounts");
  assert.match(app.slice(scopeGuard, registeredOutlet), /return \([\s\S]*Switching project/);

  const routeElements = readSource("apps/desktop/src/app/routing/route-elements.tsx");
  const accessibilityStyles = readSource("apps/desktop/src/styles/19-accessibility.css");
  assert.match(routeElements, /for \(const route of registeredRouteEntries\(\)\)/);
  assert.match(routeElements, /const LegacyProjectRouteRedirect = observer/);
  assert.match(routeElements, /shouldMoveFocusToRouteHeading/);
  assert.match(routeElements, /RouteNotFoundScreen/);
  assert.match(accessibilityStyles, /\[data-route-heading="true"\][\s\S]*inset-inline-start:\s*-10000px/);
});

test("desktop navigation consumers use registered builders only", () => {
  const consumers = [
    "apps/desktop/src/components/Shell.tsx",
    "apps/desktop/src/components/SectionTabs.tsx",
    "apps/desktop/src/screens/DashboardScreen.tsx",
    "apps/desktop/src/screens/DocsScreen.tsx",
    "apps/desktop/src/screens/ProjectsScreen.tsx",
    "apps/desktop/src/screens/SetupScreen.tsx",
    "apps/desktop/src/screens/graph/GraphScreen.tsx"
  ];
  for (const file of consumers) {
    const source = readSource(file);
    assert.doesNotMatch(source, /\bprojectPath\(/, `${file} hand-builds a compatibility route`);
    assert.doesNotMatch(source, /\bto="\/(?:projects|setup|dashboard|docs|graph|inbox|assistant|settings)/, `${file} contains a raw internal link`);
  }
});

test("production navigation has no legacy path builder callers", () => {
  const source = sourceFiles(path.join(repoRoot, "apps/desktop/src"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /\b(?:projectPath|appPathFromPathname|projectIdFromPathname)\b/);
});

test("graph adapters keep a synchronized structured fallback and bounded canvas", () => {
  const graphMap = readSource("apps/desktop/src/screens/graph/GraphMap.tsx");
  const graphScreen = readSource("apps/desktop/src/screens/graph/GraphScreen.tsx");
  const graphContent = readSource("apps/desktop/src/screens/graph/GraphContent.tsx");
  const graphController = readSource("apps/desktop/src/screens/graph/useGraphScreenController.ts");
  const graphFlow = readSource("apps/desktop/src/screens/graph/graph-flow-model.ts");
  const structured = readSource("apps/desktop/src/features/graph/accessible/StructuredGraphView.tsx");
  const storeProvider = readSource("apps/desktop/src/stores/store-context.tsx");
  const appPorts = readSource("apps/desktop/src/app/composition/ports.ts");
  const browserComposition = readSource("apps/desktop/src/app/composition/browser.ts");
  const tauriComposition = readSource("apps/desktop/src/app/composition/tauri.ts");

  assert.match(graphMap, /graph-layout-adapter\.js/);
  assert.match(graphMap, /GraphPositionStoreContext\.js/);
  assert.match(graphMap, /const positionStore = useGraphPositionStore\(\)/);
  assert.match(graphMap, /graph-interaction-state\.js/);
  assert.match(graphController, /graph-render-capability\.js/);
  assert.match(graphController, /const positionStore = useGraphPositionStore\(\)/);
  assert.equal((graphMap.match(/tabIndex=\{0\}/g) || []).length, 1);
  assert.doesNotMatch(graphMap, /\.attr\("tabindex",\s*0\)/);
  assert.match(graphMap, /role="application"/);

  assert.match(graphFlow, /virtualizeGraph\(nodes, edges, focusedNodeId\)/);
  assert.match(graphScreen, /<GraphContent controller=\{controller\.content\}/);
  assert.match(graphContent, /<GraphMap[\s\S]*<StructuredGraphView/);
  assert.match(graphContent, /model=\{model\.viewport\}[\s\S]*actions=\{actions\}/);
  assert.match(structured, /Nodes \(\{nodes\.length\}\)[\s\S]*<select/);
  assert.match(structured, /Spatial position and color are not required/);

  assert.match(appPorts, /persistence:\s*AppPersistence/);
  assert.match(storeProvider, /GraphPositionStoreProvider store=\{runtime\.services\.persistence\.graphPositions\}/);
  assert.match(browserComposition, /persistence:[\s\S]*createLocalGraphPositionStore\(\)/);
  assert.match(tauriComposition, /persistence:[\s\S]*createLocalGraphPositionStore\(\)/);
  assert.doesNotMatch(graphMap, /\blocalGraphPositionStore\b/);
  assert.doesNotMatch(graphController, /\blocalGraphPositionStore\b/);
});

test("SystemStore facade preserves one ledger and exact collaborator resource identities", () => {
  const facade = readSource("apps/desktop/src/stores/system-store.ts");

  assert.equal((facade.match(/this\.operations = new OperationLedger\(runtime\)/g) || []).length, 1);
  assert.match(facade, /new SystemDiagnosticsStore\([\s\S]*this\.operations/);
  assert.match(facade, /new SystemTrashStore\([\s\S]*this\.operations/);
  assert.match(facade, /new SystemBackupsStore\([\s\S]*this\.operations/);
  assert.match(facade, /new SystemImportStore\([\s\S]*this\.operations/);
  assert.match(facade, /this\.daemonHealthResource = this\.diagnostics\.daemonHealthResource/);
  assert.match(facade, /this\.mcpDoctorResource = this\.diagnostics\.mcpDoctorResource/);
  assert.match(facade, /this\.mcpInstallResource = this\.diagnostics\.mcpInstallResource/);
  assert.match(facade, /this\.backupsResource = this\.backupsStore\.resource/);
  assert.match(facade, /this\.trashResource = this\.trashStore\.resource/);
  assert.match(facade, /this\.importProfilesResource = this\.importStore\.profilesResource/);
  assert.match(facade, /this\.importPlanResource = this\.importStore\.planResource/);
  assert.match(facade, /this\.importResultResource = this\.importStore\.resultResource/);
});

test("extracted graph route state preserves compatible bounded query keys and defaults", () => {
  const routeState = readSource("apps/desktop/src/screens/graph/useGraphRouteState.ts");

  assert.match(routeState, /const rawViewParam = query\.view/);
  assert.match(routeState, /rawViewParam === "all" \? "all" : "context"/);
  assert.match(routeState, /const rawRelationshipModeParam = query\.relationships/);
  assert.match(routeState, /const focusedNodeId = viewMode === "all" \? "" : query\.focus/);
  assert.match(routeState, /const editingDocumentId = query\.doc/);
  assert.match(routeState, /const selectedEdgeId = query\.edge/);
  assert.match(routeState, /patch\.view = nextState\.viewMode === "all" \? "all" : null/);
  assert.match(routeState, /patch\.relationships = nextState\.relationshipMode === "ai-reviewed" \? null : nextState\.relationshipMode/);
  assert.match(routeState, /resolveGraphRelationshipMode\([\s\S]*rawRelationshipModeParam,[\s\S]*relationshipMode[\s\S]*\)/);
  assert.match(routeState, /patchSearchParams\(invalidPatch, \{ replace: true \}\)/);
});

test("context preview distinguishes loading failure partial and authoritative empty states", () => {
  const contextScreen = readSource("apps/desktop/src/screens/ContextScreen.tsx");
  assert.match(contextScreen, /status === "refreshing" && !bundle/);
  assert.match(contextScreen, /status === "failure"/);
  assert.match(contextScreen, /status === "empty"/);
  assert.match(contextScreen, /completeness\.kind === "partial"/);
  assert.ok(
    contextScreen.indexOf(") : bundle ? (") < contextScreen.indexOf('<Panel title="Bundle Summary">'),
    "the bundle summary must remain inside the accepted-bundle branch"
  );
  assert.doesNotMatch(contextScreen, /fallback="No context bundle available\."/);
});

test("desktop feature code cannot reach raw RPC clients or carriers", () => {
  const desktopRoot = path.join(repoRoot, "apps/desktop/src");
  const carrierRoots = new Set([
    path.normalize(path.join(desktopRoot, "app/composition/browser.ts")),
    path.normalize(path.join(desktopRoot, "app/composition/tauri.ts")),
    path.normalize(path.join(desktopRoot, "testing/fake-memory-transport.ts"))
  ]);
  const rawBoundary =
    /\b(?:ZharwingMemoryClient|BrowserMemoryTransport|TauriMemoryTransport|MemoryTransport)\b|\b(?:globalThis\.)?fetch\s*\(|\b(?:this\.)?(?:client|memory|apiClient)\.call\s*\(/;

  for (const file of sourceFiles(desktopRoot)) {
    const source = readFileSync(file, "utf8");
    if (!carrierRoots.has(path.normalize(file))) {
      assert.doesNotMatch(
        source,
        rawBoundary,
        `${path.relative(repoRoot, file)} bypasses the injected typed operation client`
      );
    }
  }

  for (const file of sourceFiles(path.join(desktopRoot, "stores"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/import type \{([\s\S]*?)\} from "@zharwing\/memory-api-client";/g)) {
      const importedTypes = match[1].split(",").map((name) => name.trim()).filter(Boolean);
      const allowedTypes = new Set(["MemoryClient", "BrowserSessionLockReason", "BrowserSessionState"]);
      assert.equal(
        importedTypes.every((name) => allowedTypes.has(name)),
        true,
        `${path.relative(repoRoot, file)} must depend only on narrow API-client ports`
      );
    }
    if (file.endsWith("-store.ts") && !file.endsWith(`${path.sep}root-store.ts`)) {
      assert.doesNotMatch(
        source,
        /(?:root-store\.js|\bRootStore\b|Reflect\.get\([^)]*,\s*["']call["'])/,
        `${path.relative(repoRoot, file)} must receive narrow scope/coordinator ports, never the root or a hidden raw call`
      );
    }
  }

  const rootStore = readSource("apps/desktop/src/stores/root-store.ts");
  assert.doesNotMatch(rootStore, /readonly (?:client|scheduler):/);
  assert.doesNotMatch(rootStore, /new \w+Store\(services\.memory,\s*this[,)]/);
});

test("StrictMode borrows one application runtime instead of constructing service graphs", () => {
  const main = readSource("apps/desktop/src/main.tsx");
  const provider = readSource("apps/desktop/src/stores/store-context.tsx");
  const runtime = readSource("apps/desktop/src/app/composition/runtime.ts");
  const rootStore = readSource("apps/desktop/src/stores/root-store.ts");
  const semanticStore = readSource("apps/desktop/src/stores/semantic-store.ts");
  const semanticPolling = readSource("apps/desktop/src/stores/semantic/semantic-poll-controller.ts");

  assert.equal((main.match(/const loadedRuntime = await loadApplicationRuntime\(diagnostics\);/g) || []).length, 1);
  assert.ok(main.indexOf("const loadedRuntime = await loadApplicationRuntime(diagnostics)") < main.indexOf("<React.StrictMode>"));
  assert.match(main, /if \(pageDisposed\) \{\s*loadedRuntime\.dispose\(\);\s*return;/);
  assert.match(main, /runtime = loadedRuntime;/);
  assert.equal((main.match(/new LocalDiagnosticJournal\(\)/g) || []).length, 1);
  assert.match(main, /if \(isTauri\(\)\)[\s\S]*await import\("\.\/app\/composition\/tauri\.js"\)/);
  assert.match(main, /await import\("\.\/app\/composition\/browser\.js"\)/);
  assert.match(main, /<StoreProvider runtime=\{runtime\}>/);
  const pagehide = main.indexOf('"pagehide"');
  assert.match(main, /const disposePage = \(\) => \{[\s\S]*runtime\?\.dispose\(\);[\s\S]*consoleSentinel\.dispose\(\);/);
  assert.ok(pagehide >= 0 && main.indexOf("disposePage", pagehide) > pagehide);

  assert.match(provider, /value=\{runtime\.store\}/);
  assert.doesNotMatch(provider, /\b(?:useMemo|useState|useEffect|createAppRuntime|createBrowserRuntime|new RootStore)\b/);
  assert.equal((runtime.match(/new RootStore\(/g) || []).length, 1);
  assert.match(runtime, /diagnostics: services\.diagnostics/);
  assert.match(runtime, /const unsubscribeBrowserSession = services\.browserSession\?\.subscribe/);
  assert.match(runtime, /unsubscribeBrowserSession\?\.\(\)/);
  assert.match(runtime, /if \(disposed\) return;/);
  assert.match(rootStore, /if \(this\.disposed\) return;/);
  assert.match(rootStore, /this\.semantic\.dispose\(\)/);
  assert.match(semanticStore, /this\.analysis\.dispose\(\)/);
  assert.match(semanticPolling, /this\.options\.scheduler\.setTimeout\(/);
  assert.match(semanticPolling, /this\.options\.scheduler\.clearTimeout\(/);
  assert.doesNotMatch(semanticPolling, /this\.options\.scheduler\.setInterval\(/);
});

test("Mermaid preview has an explicit offline support boundary", () => {
  const preview = readSource("apps/desktop/src/components/markdown/MermaidDiagramPreview.tsx");
  const viteConfig = readSource("apps/desktop/vite.config.ts");
  const selectiveBuild = readSource("apps/desktop/build/selective-mermaid.ts");

  assert.match(preview, /SUPPORTED_MERMAID_DIAGRAMS/);
  assert.match(preview, /if \(!isSupported\)/);
  assert.match(preview, /className="mermaid-error" role="alert"/);
  assert.match(preview, /This source remains available in Markdown mode\./);
  assert.match(viteConfig, /selectiveMermaidDiagrams\(\)/);
  assert.match(selectiveBuild, /classDetector_V2_default/);
  assert.match(selectiveBuild, /stateDetector_V2_default/);
  assert.match(selectiveBuild, /DAGRE_LAYOUT_REGISTRATION/);
  assert.doesNotMatch(selectiveBuild, /architectureDetector_default,/);
  assert.doesNotMatch(selectiveBuild, /^\s*pie,\s*$/m);
  assert.doesNotMatch(selectiveBuild, /^\s*detector_default2,\s*$/m);
  assert.doesNotMatch(selectiveBuild, /cynefin\s*\n\s*\);/);
  assert.match(selectiveBuild, /no longer matches the selective-loader boundary/);
});

test("application runtime creates and disposes one owned root graph", async () => {
  const fakeRootStore = `
    export class RootStore {
      constructor(services) {
        globalThis.__runtimeLifecycle ??= { rootCreated: 0, rootDisposed: 0 };
        this.onDispose = () => { globalThis.__runtimeLifecycle.rootDisposed += 1; };
        globalThis.__runtimeLifecycle.rootCreated += 1;
      }
      dispose() {
        this.onDispose();
      }
    }
  `;
  const runtimeModule = await importTypeScriptModuleWithMocks("apps/desktop/src/app/composition/runtime.ts", {
    "../../stores/root-store.js": fakeRootStore
  });
  const lifecycle = { rootCreated: 0, rootDisposed: 0 };
  globalThis.__runtimeLifecycle = lifecycle;
  const events = [];
  const scheduler = Object.freeze({
    setTimeout: () => 1,
    clearTimeout: () => undefined,
    setInterval: () => 1,
    clearInterval: () => undefined
  });
  const services = {
    __lifecycle: lifecycle,
    memory: {},
    clock: { now: () => new Date(0) },
    ids: { create: () => "test-id" },
    preferences: { get: () => undefined, set: () => undefined },
    persistence: { graphRelationshipMode: { get: () => "ai-reviewed", set: () => undefined } },
    diagnostics: { recordEvent: (event) => events.push(event.name) },
    browserSession: {
      subscribe(listener) {
        listener({ status: "active" });
        return () => events.push("browser.session.unsubscribed");
      }
    },
    scheduler
  };

  const runtime = runtimeModule.createAppRuntime(services);
  assert.equal(lifecycle.rootCreated, 1);
  assert.equal(runtime.services, services);
  assert.equal("scheduler" in runtime.store, false);
  assert.equal("client" in runtime.store, false);
  assert.equal(runtime.disposed, false);

  runtime.dispose();
  runtime.dispose();
  assert.equal(runtime.disposed, true);
  assert.equal(lifecycle.rootDisposed, 1);
  assert.deepEqual(events, [
    "runtime.created",
    "browser.session.state",
    "browser.session.unsubscribed",
    "runtime.disposed"
  ]);
});

test("project scope generations synchronously abort and hide obsolete projects", async () => {
  const scopeModule = await importTypeScriptModuleWithMocks(
    "apps/desktop/src/application/project-scope/project-scope-coordinator.ts",
    {
      mobx: `export function makeAutoObservable() {}`
    }
  );
  const scope = new scopeModule.ProjectScopeCoordinator();
  const resets = [];
  scope.onScopeReset((next, previous) => {
    resets.push([next?.projectId, previous?.projectId]);
  });

  const firstA = scope.activate("project-a", "A:/first");
  assert.equal(scope.currentProjectId(), "project-a");
  assert.equal(scope.captureScope(), firstA);

  const reusedA = scope.activate("project-a", "A:/updated");
  assert.equal(reusedA, firstA);
  assert.equal(reusedA.generation, 1);
  assert.equal(scope.currentProjectWorkingDirectory(), "A:/updated");

  const projectB = scope.activate("project-b", "B:/work");
  assert.equal(firstA.signal.aborted, true);
  assert.equal(scope.isScopeCurrent(firstA), false);
  assert.equal(scope.isScopeCurrent(projectB), true);

  const secondA = scope.activate("project-a", "A:/second");
  assert.equal(projectB.signal.aborted, true);
  assert.notEqual(secondA, firstA);
  assert.equal(secondA.generation, 3);
  assert.deepEqual(resets, [
    ["project-a", undefined],
    ["project-b", "project-a"],
    ["project-a", "project-b"]
  ]);

  scope.clear();
  assert.equal(secondA.signal.aborted, true);
  assert.equal(scope.captureScope(), undefined);
  assert.equal(scope.currentProjectId(), "");
});

test("resource state rejects stale success failure and finally-shaped completion", async () => {
  const resourceModule = await importTypeScriptModuleWithMocks(
    "apps/desktop/src/application/resources/resource-state.ts",
    {
      mobx: `export function makeAutoObservable() {}`,
      "@zharwing/memory-core": `
        export function createPublicError() {
          return { code: "INTERNAL", category: "internal", messageId: "operation.internal", retry: "never" };
        }
        export function isPublicError(value) {
          return Boolean(value && typeof value === "object" && typeof value.messageId === "string");
        }
      `
    }
  );
  let nextId = 0;
  let current;
  const scope = {
    captureScope: () => current,
    isScopeCurrent: (candidate) => candidate === current && !candidate.signal.aborted
  };
  const runtime = {
    createId: () => `request-${++nextId}`,
    now: () => `time-${nextId}`
  };
  const makeToken = (projectId, generation) => {
    const controller = new AbortController();
    return { token: { projectId, generation, signal: controller.signal }, controller };
  };

  const a = makeToken("a", 1);
  current = a.token;
  const slot = new resourceModule.ResourceSlot(scope, runtime);
  const attemptA = slot.begin();
  assert.equal(slot.state.status, "loading");

  const b = makeToken("b", 2);
  a.controller.abort();
  current = b.token;
  slot.reset();
  const attemptB1 = slot.begin();
  const attemptB2 = slot.begin();
  assert.equal(slot.begin(a.token), undefined);
  assert.equal(slot.state.status, "loading");
  assert.equal(slot.succeed(attemptA, ["old-a"]), false);
  assert.equal(slot.fail(attemptB1, new Error("old failure")), false);
  assert.equal(slot.cancel(attemptB1), false);
  assert.equal(slot.state.status, "loading");
  assert.equal(slot.succeed(attemptB2, [], { kind: "partial" }), true);
  assert.equal(slot.state.status, "success");
  assert.deepEqual(slot.data, []);
  assert.equal(slot.completeness.kind, "partial");

  const completeAttempt = slot.begin();
  assert.equal(slot.state.status, "refreshing");
  assert.equal(slot.succeed(completeAttempt, [], resourceModule.complete), true);
  assert.equal(slot.state.status, "empty");

  const failureAttempt = slot.begin();
  assert.equal(slot.fail(failureAttempt, new Error("private detail")), true);
  assert.equal(slot.state.status, "failure");
  assert.deepEqual(slot.data, []);
  assert.equal(slot.error.messageId, "operation.internal");
  assert.equal(JSON.stringify(slot.state).includes("private detail"), false);
});

test("operation identities stay independent and stale scoped effects cannot settle", async () => {
  const operationModule = await importTypeScriptModuleWithMocks(
    "apps/desktop/src/application/operations/operation-state.ts",
    {
      mobx: `export function makeAutoObservable() {}`,
      "@zharwing/memory-core": `
        export function createPublicError() {
          return { code: "INTERNAL", category: "internal", messageId: "operation.internal", retry: "never" };
        }
      `,
      "../resources/resource-state.js": `
        export function toPublicError(value) {
          return value && value.publicError
            ? value.publicError
            : { code: "INTERNAL", category: "internal", messageId: "operation.internal", retry: "never" };
        }
      `
    }
  );
  let nextId = 0;
  const ledger = new operationModule.OperationLedger({
    createId: (prefix) => `${prefix}:${++nextId}`,
    now: () => "unused"
  });
  const controller = new AbortController();
  const scope = { projectId: "a", generation: 1, signal: controller.signal };
  const first = ledger.begin("document:update", scope);
  const second = ledger.begin("document:update", scope);
  assert.equal(ledger.isBusy("document:update"), true);
  assert.equal(ledger.succeed(first, { id: "one" }), true);
  assert.equal(ledger.isBusy("document:update"), true);
  assert.equal(ledger.succeed(second, { id: "two" }), true);
  assert.equal(ledger.isBusy("document:update"), false);
  assert.deepEqual(ledger.state("document:update").result, { id: "two" });

  const older = ledger.begin("document:move", scope);
  const newer = ledger.begin("document:move", scope);
  assert.equal(ledger.succeed(newer, { id: "newer" }), true);
  assert.deepEqual(ledger.state("document:move").result, { id: "newer" });
  assert.equal(ledger.isBusy("document:move"), true);
  assert.equal(ledger.succeed(older, { id: "older" }), true);
  assert.deepEqual(ledger.state("document:move").result, { id: "newer" });

  const uncertain = ledger.begin("document:publish", scope);
  assert.equal(ledger.fail(uncertain, {
    publicError: {
      code: "outcome_unknown",
      category: "transport",
      messageId: "operation.outcome_unknown",
      retry: "after-reconcile"
    }
  }), true);
  assert.equal(ledger.state("document:publish").status, "reconciling");
  assert.equal(ledger.isBusy("document:publish"), true);
  assert.equal(ledger.error.messageId, "operation.outcome_unknown");
  assert.equal(ledger.abandon(uncertain), true);

  const stale = ledger.begin("document:delete", scope);
  controller.abort();
  assert.equal(ledger.fail(stale, new Error("late failure")), false);
  assert.equal(ledger.isBusy("document:delete"), false);
  assert.equal(ledger.state("document:delete").status, "idle");
});

test("DocsStore accepts only the latest request across A-B-C and A-B-A", async () => {
  const modules = await importStoreModules("apps/desktop/src/stores/docs-store.ts");
  const scope = new modules.ProjectScopeCoordinator();
  let nextId = 0;
  const runtime = { createId: (prefix) => `${prefix}:${++nextId}`, now: () => "2026-08-12T00:00:00.000Z" };
  const requests = [];
  const client = {
    operation: (name, input, options) => {
      assert.equal(name, "memory.list_docs");
      const request = deferredPromise();
      requests.push({ projectId: input.projectId, signal: options.signal, request });
      return request.promise;
    }
  };
  const coordinator = {
    refreshProjectSummary: async () => undefined,
    refreshGraph: async () => undefined,
    refreshTrash: async () => undefined
  };
  const store = new modules.DocsStore(client, scope, coordinator, runtime);

  const a1 = scope.activate("a");
  const loadA1 = store.load(a1);
  const b = scope.activate("b");
  store.clear();
  const loadB = store.load(b);
  const a2 = scope.activate("a");
  store.clear();
  const loadA2Old = store.load(a2);
  const loadA2New = store.load(a2);
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(requests[1].signal.aborted, true);

  requests[0].request.resolve([{ id: "a-old", projectId: "a" }]);
  requests[1].request.reject(new Error("private stale b failure"));
  requests[2].request.resolve([{ id: "a-overlap-old", projectId: "a" }]);
  await settleMicrotasks();
  assert.equal(store.listState.status, "loading");
  requests[3].request.resolve([{ id: "a-current", projectId: "a" }]);
  await Promise.all([loadA1, loadB, loadA2Old, loadA2New]);
  assert.deepEqual(store.list.map((doc) => doc.id), ["a-current"]);
  assert.equal(store.error, "");
});

test("SessionStore commits only the latest request across A-B-C A-B-A and same-generation overlap", async () => {
  const modules = await importStoreModules("apps/desktop/src/stores/session-store.ts");
  const scope = new modules.ProjectScopeCoordinator();
  let nextId = 0;
  const runtime = {
    createId: (prefix) => `${prefix}:${++nextId}`,
    now: () => "2026-08-12T00:00:00.000Z"
  };
  const requests = [];
  const client = {
    operation: (name, input, options) => {
      assert.equal(name, "memory.list_project_sessions");
      const request = deferredPromise();
      requests.push({ projectId: input.projectId, signal: options.signal, request });
      return request.promise;
    }
  };
  const coordinator = {
    refreshProjectSummary: async () => undefined,
    refreshGraph: async () => undefined,
    refreshTrash: async () => undefined
  };
  const store = new modules.SessionStore(client, scope, coordinator, runtime);
  scope.onScopeReset(() => store.clear());
  const row = (id, projectId) => ({
    id,
    projectId,
    status: "closed",
    taskTitle: id,
    started: "2026-08-12T00:00:00.000Z",
    updated: "2026-08-12T00:00:00.000Z"
  });

  // A -> B -> C: neither an old success nor an old failure may disturb C.
  const a1 = scope.activate("a");
  const loadA1 = store.load(20, a1);
  const b1 = scope.activate("b");
  const loadB1 = store.load(20, b1);
  const c = scope.activate("c");
  const loadC = store.load(20, c);
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(requests[1].signal.aborted, true);

  requests[0].request.resolve([row("a-stale-success", "a")]);
  requests[1].request.reject(new Error("private stale b failure"));
  await settleMicrotasks();
  assert.equal(store.listState.status, "loading");
  assert.deepEqual(store.list, []);
  assert.equal(store.loading, true);
  assert.equal(store.error, "");

  requests[2].request.resolve([row("c-current", "c")]);
  await Promise.all([loadA1, loadB1, loadC]);
  assert.deepEqual(store.list.map((session) => session.id), ["c-current"]);
  assert.equal(store.loading, false);
  assert.equal(store.error, "");

  // A -> B -> A, then two requests in the second A generation: only the
  // newest invocation may settle the resource or clear its loading state.
  const a2 = scope.activate("a");
  const loadA2 = store.load(20, a2);
  const b2 = scope.activate("b");
  const loadB2 = store.load(20, b2);
  const a3 = scope.activate("a");
  const loadA3Old = store.load(20, a3);
  const loadA3New = store.load(20, a3);
  assert.equal(requests[3].signal.aborted, true);
  assert.equal(requests[4].signal.aborted, true);

  requests[3].request.resolve([row("a-old-generation", "a")]);
  requests[4].request.reject(new Error("private stale b2 failure"));
  requests[5].request.resolve([row("a-overlap-old", "a")]);
  await settleMicrotasks();
  assert.equal(store.listState.status, "loading");
  assert.deepEqual(store.list, []);
  assert.equal(store.loading, true);
  assert.equal(store.error, "");

  requests[6].request.resolve([row("a-latest", "a")]);
  await Promise.all([loadA2, loadB2, loadA3Old, loadA3New]);
  assert.deepEqual(store.list.map((session) => session.id), ["a-latest"]);
  assert.equal(store.listState.status, "success");
  assert.equal(store.loading, false);
  assert.equal(store.error, "");
});

test("SessionStore reports bounded completeness at 20-50-100-200", async () => {
  const modules = await importStoreModules("apps/desktop/src/stores/session-store.ts");
  const scope = new modules.ProjectScopeCoordinator();
  const token = scope.activate("project-1");
  let nextId = 0;
  const runtime = { createId: (prefix) => `${prefix}:${++nextId}`, now: () => "2026-08-12T00:00:00.000Z" };
  const client = {
    operation: async (name, input) => {
      assert.equal(name, "memory.list_project_sessions");
      return Array.from({ length: input.limit }, (_, index) => ({
        id: `session-${input.limit}-${index}`,
        projectId: input.projectId,
        status: "closed",
        taskTitle: `Session ${index}`,
        started: "2026-08-12T00:00:00.000Z",
        updated: "2026-08-12T00:00:00.000Z"
      }));
    }
  };
  const coordinator = {
    refreshProjectSummary: async () => undefined,
    refreshGraph: async () => undefined,
    refreshTrash: async () => undefined
  };
  const store = new modules.SessionStore(client, scope, coordinator, runtime);
  for (const limit of [20, 50, 100, 200]) {
    await store.load(limit, token);
    assert.equal(store.requestedLimit, limit);
    assert.equal(store.listCompleteness.kind, "partial");
  }
  assert.equal(store.canLoadMore, false);
  client.operation = async (_name, input) => Array.from({ length: 19 }, (_, index) => ({
    id: `short-${index}`,
    projectId: input.projectId,
    status: "closed",
    taskTitle: `Session ${index}`,
    started: "2026-08-12T00:00:00.000Z",
    updated: "2026-08-12T00:00:00.000Z"
  }));
  await store.load(20, token);
  assert.equal(store.listCompleteness.kind, "complete");
});

test("semantic polling is completion-scheduled, focus-aware, and disposal is idempotent", async () => {
  const semanticModule = await importTypeScriptModuleWithMocks("apps/desktop/src/stores/semantic-store.ts", {
    mobx: `
      export function makeAutoObservable() {}
      export function runInAction(work) { return work(); }
    `,
    "@zharwing/memory-core": `
      export function parseOperationInput(_operation, input) { return input; }
      export function createPublicError() {
        return { code: "INTERNAL", category: "internal", messageId: "operation.internal", retry: "never" };
      }
      export function isPublicError(value) {
        return Boolean(value && typeof value === "object" && typeof value.messageId === "string");
      }
    `,
      "./graph-store.js": `
        export function graphRelationshipParams() { return {}; }
      `,
      "../graph-store.js": `
        export function graphRelationshipParams() { return {}; }
      `,
      "../application/resources/resource-state.js": readSource("apps/desktop/src/application/resources/resource-state.ts"),
      "../application/operations/operation-state.js": readSource("apps/desktop/src/application/operations/operation-state.ts"),
      "../resources/resource-state.js": readSource("apps/desktop/src/application/resources/resource-state.ts"),
      "../../application/resources/resource-state.js": readSource("apps/desktop/src/application/resources/resource-state.ts"),
      "../../application/operations/operation-state.js": readSource("apps/desktop/src/application/operations/operation-state.ts"),
      "./semantic/semantic-analysis-controller.js": readSource("apps/desktop/src/stores/semantic/semantic-analysis-controller.ts"),
      "./semantic/semantic-command-store.js": readSource("apps/desktop/src/stores/semantic/semantic-command-store.ts"),
      "./semantic/semantic-operation-keys.js": readSource("apps/desktop/src/stores/semantic/semantic-operation-keys.ts"),
      "./semantic/semantic-snapshot-client.js": readSource("apps/desktop/src/stores/semantic/semantic-snapshot-client.ts"),
      "./semantic/semantic-types.js": readSource("apps/desktop/src/stores/semantic/semantic-types.ts"),
      "./semantic-operation-keys.js": readSource("apps/desktop/src/stores/semantic/semantic-operation-keys.ts"),
      "./semantic-poll-controller.js": readSource("apps/desktop/src/stores/semantic/semantic-poll-controller.ts"),
      "./semantic-run-state.js": readSource("apps/desktop/src/stores/semantic/semantic-run-state.ts"),
      "./semantic-snapshot-client.js": readSource("apps/desktop/src/stores/semantic/semantic-snapshot-client.ts"),
      "./semantic-types.js": readSource("apps/desktop/src/stores/semantic/semantic-types.ts")
  });
  let timeoutClears = 0;
  const scheduledDelays = [];
  const pendingTimers = new Map();
  let nextTimer = 0;
  const controller = new AbortController();
  const token = { projectId: "project-1", generation: 1, signal: controller.signal };
  const scope = {
    currentProjectId: () => token.projectId,
    currentProjectWorkingDirectory: () => undefined,
    captureScope: () => token,
    isScopeCurrent: (candidate) => candidate === token && !candidate.signal.aborted,
    onScopeReset: () => () => undefined
  };
  const coordinator = {
    graphRelationshipMode: () => "deterministic",
    replaceInboxItems: () => undefined,
    replaceGraph: () => undefined,
    refreshInbox: async () => undefined,
    refreshProjectSummary: async () => undefined,
    refreshGraph: async () => undefined
  };
  const scheduler = {
    setTimeout: (callback, delay) => {
      scheduledDelays.push(delay);
      const handle = ++nextTimer;
      pendingTimers.set(handle, { callback, delay });
      return handle;
    },
    clearTimeout: (handle) => {
      if (pendingTimers.delete(handle)) timeoutClears += 1;
    },
    setInterval: () => { throw new Error("polling must not use setInterval"); },
    clearInterval: () => { throw new Error("polling must not use clearInterval"); }
  };
  let nextId = 0;
  const runtime = {
    createId: (prefix) => `${prefix}:${++nextId}`,
    now: () => "2026-08-12T00:00:00.000Z"
  };
  const pollRequests = [];
  let analyzeRequest;
  const activeRun = {
    id: "run-1",
    projectId: token.projectId,
    status: "running",
    mode: "hybrid",
    scope: { kind: "project" },
    counts: {},
    created: "2026-08-12T00:00:00.000Z",
    updated: "2026-08-12T00:00:00.000Z"
  };
  const client = {
    operation: (name) => {
      if (name === "memory.analyze_semantic_graph") {
        analyzeRequest = deferredPromise();
        return analyzeRequest.promise;
      }
      if (name === "memory.get_semantic_graph_status" || name === "memory.list_semantic_graph_runs") {
        const request = deferredPromise();
        pollRequests.push({ name, request });
        return request.promise;
      }
      if (name === "memory.list_semantic_edges" || name === "memory.list_inbox") return Promise.resolve([]);
      if (name === "memory.get_graph") return Promise.resolve({ projectId: token.projectId, nodes: [], edges: [] });
      throw new Error(`unexpected semantic operation: ${name}`);
    }
  };
  const store = new semanticModule.SemanticStore(client, scope, coordinator, scheduler, runtime);

  const analysis = store.analyze({ mode: "hybrid" });
  assert.deepEqual(scheduledDelays, [0]);
  assert.equal(pendingTimers.size, 1);
  const firstTimer = [...pendingTimers.entries()][0];
  pendingTimers.delete(firstTimer[0]);
  firstTimer[1].callback();
  await Promise.resolve();
  assert.equal(pollRequests.length, 2);
  assert.equal(pendingTimers.size, 0, "no next timer exists while the poll is in flight");

  pollRequests.find((entry) => entry.name === "memory.get_semantic_graph_status").request.resolve({
    running: true,
    runCounts: { latest: activeRun },
    edgeCounts: {}
  });
  pollRequests.find((entry) => entry.name === "memory.list_semantic_graph_runs").request.resolve([activeRun]);
  await settleMicrotasks();
  assert.equal(pendingTimers.size, 1);
  assert.equal(scheduledDelays.at(-1), 2_000);

  store.setForeground(false);
  assert.equal(pendingTimers.size, 0);
  assert.equal(timeoutClears, 1);
  store.setForeground(true);
  assert.equal(scheduledDelays.at(-1), 0);
  assert.equal(pendingTimers.size, 1);

  async function failScheduledPoll(expectedNextDelay) {
    const requestStart = pollRequests.length;
    const timer = [...pendingTimers.entries()][0];
    assert.ok(timer, "a retry timer is scheduled before the next poll");
    pendingTimers.delete(timer[0]);
    timer[1].callback();
    await Promise.resolve();
    const requests = pollRequests.slice(requestStart);
    assert.equal(requests.length, 2, "each retry performs one status and one runs request");
    for (const entry of requests) entry.request.reject(new Error("temporary polling failure"));
    await settleMicrotasks();
    assert.equal(pendingTimers.size, 1, "a failed poll schedules exactly one completion-delayed retry");
    assert.equal(scheduledDelays.at(-1), expectedNextDelay);
  }

  for (const delay of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
    await failScheduledPoll(delay);
  }

  store.dispose();
  store.dispose();
  assert.equal(store.pollHandle, undefined);
  assert.equal(pendingTimers.size, 0);
  controller.abort();
  analyzeRequest.reject(new Error("cancelled"));
  await analysis;
});

function deferredPromise() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settleMicrotasks() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

async function importTypeScriptModule(relativePath) {
  const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    },
    fileName: relativePath
  }).outputText;
  // data: URLs cannot resolve bare specifiers. A staging harness may point to
  // an already-built checkout through the explicit project-neutral override.
  const resolved = output.replace(/from\s+"@zharwing\/memory-([a-z-]+)"/g, (_match, pkg) => {
    const compiledEntry = path.join(compiledRoot, "packages", pkg, "dist/index.js");
    assert.equal(existsSync(compiledEntry), true, `missing compiled package entry: ${compiledEntry}`);
    return `from "${pathToFileURL(compiledEntry).href}"`;
  });
  return import(`data:text/javascript;base64,${Buffer.from(resolved).toString("base64")}`);
}

async function importTypeScriptModuleWithMocks(relativePath, mocks) {
  const compiledModules = new Map();
  const compiledMocks = new Map();
  return import(await compileModule(relativePath));

  async function compileModule(modulePath) {
    const existing = compiledModules.get(modulePath);
    if (existing) return existing;
    let output = transpileTypeScript(modulePath);
    const url = dataModuleUrl(output);
    compiledModules.set(modulePath, url);
    const imports = [...output.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)];
    for (const [, specifier] of imports) {
      let replacement;
      if (Object.prototype.hasOwnProperty.call(mocks, specifier)) {
        replacement = await compileMock(specifier, modulePath);
      } else if (specifier.startsWith(".")) {
        replacement = await compileModule(resolveSourceModule(modulePath, specifier));
      }
      if (replacement) output = output.replaceAll(`"${specifier}"`, `"${replacement}"`);
    }
    const finalUrl = dataModuleUrl(output);
    compiledModules.set(modulePath, finalUrl);
    return finalUrl;
  }

  async function compileMock(specifier, fromPath) {
    const existing = compiledMocks.get(specifier);
    if (existing) return existing;
    const mockPath = specifier.startsWith(".")
      ? resolveSourceModule(fromPath, specifier)
      : `mock:${specifier}.ts`;
    let mockOutput = transpileTypeScriptSource(mocks[specifier], mockPath);
    const url = dataModuleUrl(mockOutput);
    compiledMocks.set(specifier, url);
    const imports = [...mockOutput.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)];
    for (const [, dependency] of imports) {
      let replacement;
      if (Object.prototype.hasOwnProperty.call(mocks, dependency)) {
        replacement = await compileMock(dependency, mockPath);
      } else if (dependency.startsWith(".")) {
        replacement = await compileModule(resolveSourceModule(mockPath, dependency));
      }
      if (replacement) mockOutput = mockOutput.replaceAll(`"${dependency}"`, `"${replacement}"`);
    }
    const finalUrl = dataModuleUrl(mockOutput);
    compiledMocks.set(specifier, finalUrl);
    return finalUrl;
  }
}

function resolveSourceModule(fromPath, specifier) {
  const base = path.resolve(repoRoot, path.dirname(fromPath), specifier);
  const candidates = [
    base,
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".tsx"),
    `${base}.ts`,
    `${base}.tsx`
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  assert.ok(match, `missing source module for ${fromPath}: ${specifier}`);
  return path.relative(repoRoot, match).split(path.sep).join("/");
}

async function importStoreModules(storePath) {
  const mobx = `export function makeAutoObservable() {}`;
  const core = `
    export function createPublicError() {
      return { code: "internal", category: "internal", messageId: "operation.internal", retry: "never" };
    }
    export function isPublicError(value) {
      return Boolean(value && typeof value === "object" && typeof value.messageId === "string");
    }
  `;
  const mocks = {
    mobx,
    "@zharwing/memory-core": core,
    "../application/operations/destructive-operation.js": `
      export function prepareDestructiveDispatch(client, projectId, operation, input, options) {
        return () => client.operation(operation, input, options);
      }
      export async function executeConfirmedDestructiveOperation(client, projectId, operation, input, options) {
        return client.operation(operation, input, options);
      }
    `,
    "../application/resources/resource-state.js": readSource("apps/desktop/src/application/resources/resource-state.ts"),
    "../application/operations/operation-state.js": readSource("apps/desktop/src/application/operations/operation-state.ts"),
    "../resources/resource-state.js": readSource("apps/desktop/src/application/resources/resource-state.ts")
  };
  const [storeModule, scopeModule] = await Promise.all([
    importTypeScriptModuleWithMocks(storePath, mocks),
    importTypeScriptModuleWithMocks("apps/desktop/src/application/project-scope/project-scope-coordinator.ts", { mobx })
  ]);
  return { ...storeModule, ...scopeModule };
}

function transpileTypeScript(relativePath) {
  const source = readSource(relativePath);
  return transpileTypeScriptSource(source, relativePath);
}

function transpileTypeScriptSource(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    },
    fileName
  }).outputText;
}

function dataModuleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function readSource(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [fullPath] : [];
  });
}
