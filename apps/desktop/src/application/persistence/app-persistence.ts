import type { GraphPositionStore } from "../../features/graph/persistence/graph-position-store.js";

export type GraphRelationshipMode = "deterministic" | "ai-reviewed";

export interface RawPreferenceStore {
  get(key: string): string | undefined;
  set(key: string, value: string | undefined): void;
}

export interface GraphRelationshipPreferenceStore {
  read(): GraphRelationshipMode;
  write(mode: GraphRelationshipMode): void;
}

export interface AppPersistence {
  readonly graphRelationshipMode: GraphRelationshipPreferenceStore;
  readonly graphPositions: GraphPositionStore;
}

// Physical compatibility: this key and its raw string values predate the
// typed persistence boundary and must remain readable without migration.
export const GRAPH_RELATIONSHIP_MODE_STORAGE_KEY = "aimem.graph.relationshipMode";

export function createAppPersistence(
  preferences: RawPreferenceStore,
  graphPositions: GraphPositionStore
): AppPersistence {
  return Object.freeze({
    graphRelationshipMode: Object.freeze({
      read: () => decodeGraphRelationshipMode(
        preferences.get(GRAPH_RELATIONSHIP_MODE_STORAGE_KEY)
      ),
      write: (mode: GraphRelationshipMode) => {
        preferences.set(GRAPH_RELATIONSHIP_MODE_STORAGE_KEY, decodeGraphRelationshipMode(mode));
      }
    }),
    graphPositions
  });
}

export function decodeGraphRelationshipMode(input: unknown): GraphRelationshipMode {
  return input === "deterministic" || input === "ai-reviewed"
    ? input
    : "ai-reviewed";
}
