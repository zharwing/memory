import { RootStore } from "../../stores/root-store.js";
import type { DiagnosticJournal } from "../../platform/diagnostics/diagnostic-journal.js";
import type { AppServices } from "./ports.js";
import type { ResourceInvalidationBus } from "../../application/resources/resource-invalidation-bus.js";
import { createDesktopFeaturePorts } from "./feature-port-adapter.js";

export interface AppRuntime {
  readonly services: AppServices;
  readonly diagnostics: DiagnosticJournal;
  readonly store: RootStore;
  readonly disposed: boolean;
  dispose(): void;
}

/** Owns exactly one service/store graph; React renders only borrow it. */
export function createAppRuntime(services: AppServices): AppRuntime {
  const invalidations: ResourceInvalidationBus = services.invalidations ?? {
    sourceInstanceId: services.ids.create(),
    publish: () => undefined,
    subscribe: () => () => undefined,
    dispose: () => undefined
  };
  const ownsInvalidations = !services.invalidations;
  const store = new RootStore({
    features: createDesktopFeaturePorts(services.memory),
    scheduler: services.scheduler,
    clock: services.clock,
    ids: services.ids,
    graphPreferences: services.persistence.graphRelationshipMode,
    browserSession: services.browserSession,
    invalidations
  });
  let disposed = false;
  services.diagnostics.recordEvent({ name: "runtime.created", surface: "runtime" });
  const unsubscribeBrowserSession = services.browserSession?.subscribe((state) => {
    services.diagnostics.recordEvent({
      name: "browser.session.state",
      surface: "session",
      sessionState: state.status
    });
  });
  const unsubscribeInvalidations = invalidations.subscribe((event) => {
    store.resourceRegistry.assertExhaustive(event.resourceTags);
    if (!event.projectId || event.projectId === store.projectScope.currentProjectId()) {
      void store.resourceRegistry.invalidate(event.resourceTags);
    }
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
          try { unsubscribeInvalidations(); } finally {
            if (ownsInvalidations || services.invalidations === invalidations) invalidations.dispose();
            services.diagnostics.recordEvent({ name: "runtime.disposed", surface: "runtime" });
          }
        }
      }
    }
  };
}
