import React, { createContext, useContext } from "react";
import { RootStore } from "./root-store.js";
import type { AppRuntime } from "../app/composition/runtime.js";

const StoreContext = createContext<RootStore | null>(null);

export function StoreProvider({ children, runtime }: { children: React.ReactNode; runtime: AppRuntime }) {
  return <StoreContext.Provider value={runtime.store}>{children}</StoreContext.Provider>;
}

export function useStore(): RootStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("StoreProvider is missing.");
  return store;
}
