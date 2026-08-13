import { useCallback, useEffect } from "react";
import type { GraphRelationshipMode } from "../../stores/graph-store.js";
import { useCloseWhenMissing, useSearchParamsPatch } from "../../hooks/useSearchParamState.js";
import { parseBoundedSearchParam } from "../../utils/routes.js";
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
  const [searchParams, patchSearchParams] = useSearchParamsPatch();
  const rawViewParam = parseBoundedSearchParam(searchParams, "view", { maximumLength: 16 });
  const viewMode: GraphViewMode = rawViewParam === "all" ? "all" : "context";
  const rawRelationshipModeParam = parseBoundedSearchParam(searchParams, "relationships", { maximumLength: 32 });
  const focusedNodeId = viewMode === "all" ? "" : parseBoundedSearchParam(searchParams, "focus") || "";
  const editingDocumentId = parseBoundedSearchParam(searchParams, "doc") || "";
  const selectedEdgeId = parseBoundedSearchParam(searchParams, "edge", { maximumLength: 320 }) || "";

  const update = useCallback((nextState: GraphSearchStatePatch, replace = false) => {
    const patch: Record<string, string | null | undefined> = {};
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
    const invalidPatch: Record<string, null> = {};
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
    const nextRelationshipMode = relationshipModeFromSearchParam(rawRelationshipModeParam) || "ai-reviewed";
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
