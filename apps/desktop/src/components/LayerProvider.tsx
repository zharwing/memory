import {
  createContext,
  type ReactNode,
  useContext,
  useRef
} from "react";

export interface LayerStackRegistry {
  readonly push: (instanceId: string) => void;
  readonly remove: (instanceId: string) => void;
  readonly isTop: (instanceId: string) => boolean;
}

const LayerStackContext = createContext<LayerStackRegistry | null>(null);

/**
 * Owns ordering for every dismissible application layer in one mounted
 * runtime. Keeping the stack in React ownership isolates app roots, previews,
 * and tests from one another.
 */
export function LayerProvider({ children }: { children: ReactNode }) {
  const stackRef = useRef<string[]>([]);
  const registryRef = useRef<LayerStackRegistry | null>(null);
  if (!registryRef.current) {
    registryRef.current = {
      push(instanceId) {
        const existingIndex = stackRef.current.lastIndexOf(instanceId);
        if (existingIndex >= 0) stackRef.current.splice(existingIndex, 1);
        stackRef.current.push(instanceId);
      },
      remove(instanceId) {
        const index = stackRef.current.lastIndexOf(instanceId);
        if (index >= 0) stackRef.current.splice(index, 1);
      },
      isTop(instanceId) {
        return stackRef.current.at(-1) === instanceId;
      }
    };
  }
  return (
    <LayerStackContext.Provider value={registryRef.current}>
      {children}
    </LayerStackContext.Provider>
  );
}

/** @deprecated Compatibility alias; LayerProvider owns all layer ordering. */
export const DialogStackProvider = LayerProvider;

export function useLayerStack(): LayerStackRegistry {
  const stack = useContext(LayerStackContext);
  if (!stack) throw new Error("LayerProvider is missing.");
  return stack;
}
