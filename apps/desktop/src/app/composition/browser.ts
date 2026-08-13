import { BrowserMemoryClient } from "@zharwing/memory-api-client";
import { BootstrapGatedMemoryClient } from "../../application/operations/bootstrap-gated-client.js";
import { consumeBrowserBootstrapCode } from "../../platform/browser/session-bootstrap.js";
import { BrowserUiPreferences } from "../../platform/browser/ui-preferences.js";
import { createLocalGraphPositionStore } from "../../features/graph/persistence/graph-position-store.js";
import {
  LocalDiagnosticJournal,
  type DiagnosticJournal
} from "../../platform/diagnostics/diagnostic-journal.js";
import {
  globalScheduler,
  randomIds,
  systemClock,
  type AppServices,
  type BrowserSessionPort
} from "./ports.js";
import { createAppRuntime } from "./runtime.js";

export function createBrowserServices(
  diagnostics: DiagnosticJournal = new LocalDiagnosticJournal()
): AppServices {
  const ids = randomIds;
  const scheduler = globalScheduler;
  const memory = new BrowserMemoryClient({
    runtime: {
      createId: () => ids.create(),
      setTimeout: (callback, delayMs) => scheduler.setTimeout(callback, delayMs),
      clearTimeout: (handle) => scheduler.clearTimeout(handle)
    }
  });
  const bootstrapCode = typeof globalThis.location === "undefined"
    ? undefined
    : consumeBrowserBootstrapCode();
  const bootstrap = bootstrapCode
    ? memory.session.bootstrap(bootstrapCode)
    : browserPreviewEnabled()
      ? memory.session.bootstrapPersonalPreview()
      : Promise.resolve();
  // Mark startup rejection handled even when no operation is issued. Calls
  // still await the original promise and receive the failure.
  void bootstrap.catch(() => undefined);
  return {
    memory: new BootstrapGatedMemoryClient(memory, bootstrap),
    // This composition boundary is intentionally structural: clean builds
    // compile the API-client source first, while an existing checkout may
    // still resolve its previous generated declaration during an isolated UI
    // typecheck. The source controller implements and tests this exact port.
    browserSession: memory.session as unknown as BrowserSessionPort,
    clock: systemClock,
    ids,
    preferences: new BrowserUiPreferences(""),
    graphPositions: createLocalGraphPositionStore(),
    diagnostics,
    scheduler
  };
}

function browserPreviewEnabled(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const profile = env.ZHARWING_PUBLIC_PROFILE;
  return profile === undefined || profile === "" || profile === "personal-preview";
}

export function createBrowserRuntime(
  diagnostics: DiagnosticJournal = new LocalDiagnosticJournal()
) {
  return createAppRuntime(createBrowserServices(diagnostics));
}
