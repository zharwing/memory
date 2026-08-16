import type { PublicError } from "@zharwing/memory-core";
import type {
  Completeness,
  ResourceSlot,
  ResourceState
} from "./resource-state.js";

export type ResourceReadModel<T> =
  | { readonly state: "idle"; readonly data: undefined; readonly completeness: undefined }
  | { readonly state: "loading"; readonly data: undefined; readonly completeness: undefined }
  | { readonly state: "refreshing"; readonly data: T; readonly completeness: Completeness }
  | { readonly state: "success"; readonly data: T; readonly completeness: { readonly kind: "complete" } }
  | { readonly state: "partial"; readonly data: T; readonly completeness: Extract<Completeness, { kind: "partial" }> }
  | { readonly state: "complete-empty"; readonly data: T; readonly completeness: { readonly kind: "complete" } }
  | { readonly state: "stale-with-data"; readonly data: T; readonly completeness: Completeness; readonly error: PublicError }
  | { readonly state: "failure"; readonly data: undefined; readonly completeness: undefined; readonly error: PublicError };

export function resourceReadModel<T>(
  resource: Pick<ResourceSlot<T>, "state">
): ResourceReadModel<T> {
  return projectResourceState(resource.state);
}

export function projectResourceState<T>(state: ResourceState<T>): ResourceReadModel<T> {
  switch (state.status) {
    case "idle": return { state: "idle", data: undefined, completeness: undefined };
    case "loading": return { state: "loading", data: undefined, completeness: undefined };
    case "refreshing": return {
      state: "refreshing",
      data: state.data,
      completeness: state.completeness
    };
    case "empty": return {
      state: "complete-empty",
      data: state.data,
      completeness: state.completeness
    };
    case "success": return state.completeness.kind === "partial"
      ? { state: "partial", data: state.data, completeness: state.completeness }
      : { state: "success", data: state.data, completeness: state.completeness };
    case "failure": return state.previous
      ? {
          state: "stale-with-data",
          data: state.previous.data,
          completeness: state.previous.completeness,
          error: state.error
        }
      : { state: "failure", data: undefined, completeness: undefined, error: state.error };
  }
}
