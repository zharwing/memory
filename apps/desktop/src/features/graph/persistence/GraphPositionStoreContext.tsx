import { createContext, useContext, type ReactNode } from "react";
import type { GraphPositionStore } from "./graph-position-store.js";

const GraphPositionStoreContext = createContext<GraphPositionStore | null>(null);

export function GraphPositionStoreProvider({
  children,
  store
}: {
  children: ReactNode;
  store: GraphPositionStore;
}) {
  return (
    <GraphPositionStoreContext.Provider value={store}>
      {children}
    </GraphPositionStoreContext.Provider>
  );
}

export function useGraphPositionStore(): GraphPositionStore {
  const store = useContext(GraphPositionStoreContext);
  if (!store) throw new Error("GraphPositionStoreProvider is missing.");
  return store;
}
