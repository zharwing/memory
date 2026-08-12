import { RootStore } from "../../stores/root-store.js";
import type { AppServices } from "./ports.js";

export interface AppRuntime {
  readonly services: AppServices;
  readonly store: RootStore;
  readonly disposed: boolean;
  dispose(): void;
}

/** Owns exactly one service/store graph; React renders only borrow it. */
export function createAppRuntime(services: AppServices): AppRuntime {
  const store = new RootStore(services);
  let disposed = false;
  services.diagnostics.record({ name: "runtime.created" });
  return {
    services,
    store,
    get disposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      store.dispose();
      services.diagnostics.record({ name: "runtime.disposed" });
    }
  };
}
