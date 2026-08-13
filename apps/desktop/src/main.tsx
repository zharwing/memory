import React from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import {
  DiagnosticJournalProvider,
  RecoveryPanel,
  RootRecoveryBoundary
} from "./app/recovery/index.js";
import type { AppRuntime } from "./app/composition/runtime.js";
import {
  installProductionConsoleSentinel,
  LocalDiagnosticJournal,
  type DiagnosticJournal
} from "./platform/diagnostics/index.js";
import { StoreProvider } from "./stores/store-context.js";
import "./styles/global.css";

const environment = (import.meta as unknown as { env?: { PROD?: boolean } }).env;

function redirectLegacyLocalhost(): boolean {
  if (isTauri() || globalThis.location?.hostname !== "localhost") return false;
  const canonicalUrl = new URL(globalThis.location.href);
  canonicalUrl.hostname = "127.0.0.1";
  globalThis.location.replace(canonicalUrl.href);
  return true;
}

async function loadApplicationRuntime(diagnostics: DiagnosticJournal) {
  if (isTauri()) {
    const { createTauriRuntime } = await import("./app/composition/tauri.js");
    return createTauriRuntime(invoke, diagnostics);
  }
  const { createBrowserRuntime } = await import("./app/composition/browser.js");
  return createBrowserRuntime(diagnostics);
}

function startApplication(): void {
  if (redirectLegacyLocalhost()) {
    // Keep localhost bookmarks compatible while ensuring the UI and local daemon
    // share one exact loopback site for the browser's private session cookie.
    return;
  }

  const diagnostics = new LocalDiagnosticJournal();
  const consoleSentinel = installProductionConsoleSentinel(
    environment?.PROD === true,
    diagnostics
  );
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    // There is no render target for a recovery surface. Record only the closed
    // classification and avoid creating an exception/stack or console output.
    diagnostics.recordFailure({ name: "failure.caught", surface: "root" }, true);
    consoleSentinel.dispose();
    return;
  }

  const root = createRoot(rootElement);
  let runtime: AppRuntime | undefined;
  let pageDisposed = false;
  const disposePage = () => {
    if (pageDisposed) return;
    pageDisposed = true;
    try {
      runtime?.dispose();
    } finally {
      consoleSentinel.dispose();
    }
  };
  globalThis.addEventListener?.("pagehide", disposePage, { once: true });

  void (async () => {
    try {
      const loadedRuntime = await loadApplicationRuntime(diagnostics);
      if (pageDisposed) {
        loadedRuntime.dispose();
        return;
      }
      runtime = loadedRuntime;

      root.render(
        <React.StrictMode>
          <DiagnosticJournalProvider journal={diagnostics}>
            <RootRecoveryBoundary>
              <StoreProvider runtime={runtime}>
                <BrowserRouter>
                  <App />
                </BrowserRouter>
              </StoreProvider>
            </RootRecoveryBoundary>
          </DiagnosticJournalProvider>
        </React.StrictMode>
      );
    } catch (error) {
      diagnostics.recordFailure({ name: "failure.caught", surface: "root" }, error);
      if (pageDisposed) return;
      root.render(
        <DiagnosticJournalProvider journal={diagnostics}>
          <RecoveryPanel
            surface="root"
            title="The app could not start"
          />
        </DiagnosticJournalProvider>
      );
    }
  })();
}

startApplication();
