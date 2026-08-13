import { RootStore } from "../../stores/root-store.js";
import type { DiagnosticJournal } from "../../platform/diagnostics/diagnostic-journal.js";
import type { AppServices } from "./ports.js";

export interface AppRuntime {
  readonly services: AppServices;
  readonly diagnostics: DiagnosticJournal;
  readonly store: RootStore;
  readonly disposed: boolean;
  dispose(): void;
}

/** Owns exactly one service/store graph; React renders only borrow it. */
export function createAppRuntime(services: AppServices): AppRuntime {
  const store = new RootStore(services);
  let disposed = false;
  services.diagnostics.recordEvent({ name: "runtime.created", surface: "runtime" });
  const unsubscribeBrowserSession = services.browserSession?.subscribe((state) => {
    services.diagnostics.recordEvent({
      name: "browser.session.state",
      surface: "session",
      sessionState: state.status
    });
  });
  return {
    services,
    diagnostics: services.diagnostics,
    store,
    get disposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        store.dispose();
      } finally {
        try {
          unsubscribeBrowserSession?.();
        } finally {
          services.diagnostics.recordEvent({ name: "runtime.disposed", surface: "runtime" });
        }
      }
    }
  };
}
