import { OperationClient, TauriMemoryTransport, type TauriInvoke } from "@zharwing/memory-api-client";
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
  type AppServices
} from "./ports.js";
import { createAppRuntime } from "./runtime.js";

export function createTauriServices(
  invoke: TauriInvoke,
  diagnostics: DiagnosticJournal = new LocalDiagnosticJournal()
): AppServices {
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
    // Preserve the historical physical preference keys while moving storage
    // ownership behind the injected preference port.
    preferences: new BrowserUiPreferences(""),
    graphPositions: createLocalGraphPositionStore(),
    diagnostics,
    scheduler
  };
}

export function createTauriRuntime(
  invoke: TauriInvoke,
  diagnostics: DiagnosticJournal = new LocalDiagnosticJournal()
) {
  return createAppRuntime(createTauriServices(invoke, diagnostics));
}
