import { useCallback, useEffect } from "react";
import type { GraphRelationshipMode } from "../../stores/graph-store.js";
import {
  useCloseWhenMissing,
  useRouteQueryPatch,
  type RouteQueryPatch
} from "../../hooks/useSearchParamState.js";
import type { GraphViewMode } from "./graph-display-types.js";

export interface GraphSearchStatePatch {
  viewMode?: GraphViewMode;
  relationshipMode?: GraphRelationshipMode;
  focus?: string | null;
  doc?: string | null;
  edge?: string | null;
}

export interface GraphRouteState {
  viewMode: GraphViewMode;
  focusedNodeId: string;
  editingDocumentId: string;
  selectedEdgeId: string;
  update(nextState: GraphSearchStatePatch, replace?: boolean): void;
}

export function useGraphRouteState({
  relationshipMode,
  onRelationshipModeChange
}: {
  relationshipMode: GraphRelationshipMode;
  onRelationshipModeChange(mode: GraphRelationshipMode): void;
}): GraphRouteState {
  const [searchParams, query, patchSearchParams] = useRouteQueryPatch("graph");
  const rawViewParam = query.view;
  const viewMode: GraphViewMode = rawViewParam === "all" ? "all" : "context";
  const rawRelationshipModeParam = query.relationships;
  const focusedNodeId = viewMode === "all" ? "" : query.focus || "";
  const editingDocumentId = query.doc || "";
  const selectedEdgeId = query.edge || "";

  const update = useCallback((nextState: GraphSearchStatePatch, replace = false) => {
    const patch: RouteQueryPatch<"graph"> = {};
    if (nextState.viewMode) patch.view = nextState.viewMode === "all" ? "all" : null;
    if (nextState.relationshipMode) {
      patch.relationships = nextState.relationshipMode === "ai-reviewed" ? null : nextState.relationshipMode;
    }
    if (nextState.focus !== undefined) patch.focus = nextState.focus;
    if (nextState.doc !== undefined) patch.doc = nextState.doc;
    if (nextState.edge !== undefined) patch.edge = nextState.edge;
    patchSearchParams(patch, { replace });
  }, [patchSearchParams]);

  useEffect(() => {
    const invalidPatch: RouteQueryPatch<"graph"> = {};
    if (searchParams.has("view") && rawViewParam !== "all") invalidPatch.view = null;
    if (searchParams.has("relationships") && !relationshipModeFromSearchParam(rawRelationshipModeParam ?? null)) {
      invalidPatch.relationships = null;
    }
    if (searchParams.has("focus") && !focusedNodeId) invalidPatch.focus = null;
    if (searchParams.has("doc") && !editingDocumentId) invalidPatch.doc = null;
    if (searchParams.has("edge") && !selectedEdgeId) invalidPatch.edge = null;
    if (Object.keys(invalidPatch).length) {
      patchSearchParams(invalidPatch, { replace: true });
      return;
    }
    // A valid URL value overrides and persists the preference. When the URL
    // omits the optional key, retain the injected persisted preference instead
    // of silently resetting every normal Graph navigation to ai-reviewed.
    const nextRelationshipMode = resolveGraphRelationshipMode(
      rawRelationshipModeParam,
      relationshipMode
    );
    if (nextRelationshipMode !== relationshipMode) onRelationshipModeChange(nextRelationshipMode);
  }, [
    editingDocumentId,
    focusedNodeId,
    onRelationshipModeChange,
    patchSearchParams,
    rawRelationshipModeParam,
    rawViewParam,
    relationshipMode,
    searchParams,
    selectedEdgeId
  ]);

  return {
    viewMode,
    focusedNodeId,
    editingDocumentId,
    selectedEdgeId,
    update
  };
}

export function useGraphRouteResourceGuards(
  route: GraphRouteState,
  {
    focusedNodeMissing,
    editingDocumentMissing,
    selectedEdgeMissing,
    onFocusedNodeMissing
  }: {
    focusedNodeMissing: boolean;
    editingDocumentMissing: boolean;
    selectedEdgeMissing: boolean;
    onFocusedNodeMissing(): void;
  }
): void {
  useCloseWhenMissing(route.focusedNodeId, focusedNodeMissing, onFocusedNodeMissing);
  useCloseWhenMissing(
    route.editingDocumentId,
    editingDocumentMissing,
    () => route.update({ doc: null }, true)
  );
  useCloseWhenMissing(
    route.selectedEdgeId,
    selectedEdgeMissing,
    () => route.update({ edge: null }, true)
  );
}

function relationshipModeFromSearchParam(input: string | null | undefined): GraphRelationshipMode | undefined {
  return input === "ai-reviewed" || input === "deterministic" ? input : undefined;
}

export function resolveGraphRelationshipMode(
  input: string | null | undefined,
  persisted: GraphRelationshipMode
): GraphRelationshipMode {
  return relationshipModeFromSearchParam(input) ?? persisted;
}
