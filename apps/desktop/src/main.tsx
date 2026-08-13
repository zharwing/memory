import React from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import {
  RecoveryPanel,
  RootRecoveryBoundary
} from "./app/recovery/index.js";
import {
  installProductionConsoleSentinel,
  localDiagnostics
} from "./platform/diagnostics/index.js";
import { StoreProvider } from "./stores/store-context.js";
import "./styles/global.css";

const environment = (import.meta as unknown as { env?: { PROD?: boolean } }).env;
const consoleSentinel = installProductionConsoleSentinel(environment?.PROD === true);
const rootElement = document.getElementById("root");

function redirectLegacyLocalhost(): boolean {
  if (isTauri() || globalThis.location?.hostname !== "localhost") return false;
  const canonicalUrl = new URL(globalThis.location.href);
  canonicalUrl.hostname = "127.0.0.1";
  globalThis.location.replace(canonicalUrl.href);
  return true;
}

async function loadApplicationRuntime() {
  if (isTauri()) {
    const { createTauriRuntime } = await import("./app/composition/tauri.js");
    return createTauriRuntime(invoke);
  }
  const { createBrowserRuntime } = await import("./app/composition/browser.js");
  return createBrowserRuntime();
}

if (redirectLegacyLocalhost()) {
  // Keep localhost bookmarks compatible while ensuring the UI and local daemon
  // share one exact loopback site for the browser's private session cookie.
} else if (!rootElement) {
  // There is no render target for a recovery surface. Record only the closed
  // classification and avoid creating an exception/stack or console output.
  localDiagnostics.recordFailure({ name: "failure.caught", surface: "root" }, true);
} else {
  const root = createRoot(rootElement);
  void (async () => {
    try {
      const runtime = await loadApplicationRuntime();
      globalThis.addEventListener?.("pagehide", () => {
        try {
          runtime.dispose();
        } finally {
          consoleSentinel.dispose();
        }
      }, { once: true });

      root.render(
        <React.StrictMode>
          <RootRecoveryBoundary>
            <StoreProvider runtime={runtime}>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </StoreProvider>
          </RootRecoveryBoundary>
        </React.StrictMode>
      );
    } catch (error) {
      localDiagnostics.recordFailure({ name: "failure.caught", surface: "root" }, error);
      root.render(
        <RecoveryPanel
          surface="root"
          title="The app could not start"
        />
      );
    }
  })();
}
