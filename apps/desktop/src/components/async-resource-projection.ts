import type { ResourceState } from "../application/resources/resource-state.js";

export type ResourceContentStatus = "refreshing" | "success" | "partial" | "error";

export type AsyncResourceProjection<T> =
  | { readonly status: "loading" | "empty" | "error"; readonly hasData: false }
  | { readonly status: ResourceContentStatus; readonly hasData: true; readonly data: T };

/** Project the resource state machine into the shared async presenter. */
export function resourceStateToAsyncRegion<T>(
  state: ResourceState<T>,
  options: { readonly retainPreviousOnFailure?: boolean } = {}
): AsyncResourceProjection<T> {
  switch (state.status) {
    case "idle":
    case "loading":
      return { status: "loading", hasData: false };
    case "refreshing":
      return { status: "refreshing", hasData: true, data: state.data };
    case "success":
      return {
        status: state.completeness.kind === "partial" ? "partial" : "success",
        hasData: true,
        data: state.data
      };
    case "empty":
      return { status: "empty", hasData: false };
    case "failure":
      return options.retainPreviousOnFailure && state.previous
        ? { status: "error", hasData: true, data: state.previous.data }
        : { status: "error", hasData: false };
  }
}
