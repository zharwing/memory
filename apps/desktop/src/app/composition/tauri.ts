import { OperationClient, TauriMemoryTransport, type TauriInvoke } from "@zharwing/memory-api-client";
import { BrowserUiPreferences } from "../../platform/browser/ui-preferences.js";
import { InMemoryDiagnosticSink } from "../../platform/diagnostics/in-memory-diagnostics.js";
import {
  globalScheduler,
  randomIds,
  systemClock,
  type AppServices
} from "./ports.js";
import { createAppRuntime } from "./runtime.js";

export function createTauriServices(invoke: TauriInvoke): AppServices {
  const ids = randomIds;
  const scheduler = globalScheduler;
  const memory = new OperationClient(
    new TauriMemoryTransport({ invoke }),
    {
      createId: () => ids.create(),
      setTimeout: (callback, delayMs) => scheduler.setTimeout(callback, delayMs),
      clearTimeout: (handle) => scheduler.clearTimeout(handle)
    },
    "desktop"
  );
  return {
    memory,
    clock: systemClock,
    ids,
    preferences: new BrowserUiPreferences(),
    diagnostics: new InMemoryDiagnosticSink(),
    scheduler
  };
}

export function createTauriRuntime(invoke: TauriInvoke) {
  return createAppRuntime(createTauriServices(invoke));
}
