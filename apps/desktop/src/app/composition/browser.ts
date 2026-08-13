import { BrowserMemoryClient } from "@zharwing/memory-api-client";
import { BootstrapGatedMemoryClient } from "../../application/operations/bootstrap-gated-client.js";
import { consumeBrowserBootstrapCode } from "../../platform/browser/session-bootstrap.js";
import { BrowserUiPreferences } from "../../platform/browser/ui-preferences.js";
import { InMemoryDiagnosticSink } from "../../platform/diagnostics/in-memory-diagnostics.js";
import {
  globalScheduler,
  randomIds,
  systemClock,
  type AppServices
} from "./ports.js";
import { createAppRuntime } from "./runtime.js";

export function createBrowserServices(): AppServices {
  const ids = randomIds;
  const scheduler = globalScheduler;
  const diagnostics = new InMemoryDiagnosticSink();
  const memory = new BrowserMemoryClient({
    onStateChange: (state) => diagnostics.record({
      name: "browser.session.state",
      sessionState: state.status,
      ...(state.status === "locked" ? { lockReason: state.reason } : {})
    }),
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
    browserSession: memory.session,
    clock: systemClock,
    ids,
    preferences: new BrowserUiPreferences(),
    diagnostics,
    scheduler
  };
}

function browserPreviewEnabled(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const profile = env.ZHARWING_PUBLIC_PROFILE;
  return profile === undefined || profile === "" || profile === "personal-preview";
}

export function createBrowserRuntime() {
  return createAppRuntime(createBrowserServices());
}
