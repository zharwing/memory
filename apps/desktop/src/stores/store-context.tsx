import React, { createContext, useContext, useMemo } from "react";
import { RootStore } from "./root-store.js";

const StoreContext = createContext<RootStore | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const store = useMemo(() => new RootStore(), []);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): RootStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("StoreProvider is missing.");
  return store;
}
