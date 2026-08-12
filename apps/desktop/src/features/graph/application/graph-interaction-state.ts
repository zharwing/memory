export interface GraphFocusState {
  focusedNodeId: string;
  history: readonly string[];
}

export type GraphKeyboardCommand = "first" | "last" | "next" | "previous";

/** Pure state adapter shared by visual and structured graph controllers. */
export function reconcileGraphNodeSelection(
  nodeIds: ReadonlySet<string>,
  selectedNodeId: string,
  focusedNodeId: string
): string {
  if (focusedNodeId && nodeIds.has(focusedNodeId)) return focusedNodeId;
  if (selectedNodeId && nodeIds.has(selectedNodeId)) return selectedNodeId;
  return nodeIds.values().next().value ?? "";
}

export function graphKeyboardCommandForKey(key: string): GraphKeyboardCommand | undefined {
  if (key === "Home") return "first";
  if (key === "End") return "last";
  if (key === "ArrowRight" || key === "ArrowDown") return "next";
  if (key === "ArrowLeft" || key === "ArrowUp") return "previous";
  return undefined;
}

/**
 * Moves graph focus without relying on visual position. Selecting the current
 * focus walks back through history; selecting a project/root returns to the
 * overview.
 */
export function transitionGraphFocus(
  state: GraphFocusState,
  nextNodeId: string,
  nextNodeIsRoot: boolean
): GraphFocusState {
  if (!nextNodeId || nextNodeIsRoot) return { focusedNodeId: "", history: [] };

  if (nextNodeId === state.focusedNodeId) {
    const previousFocusedNodeId = state.history[state.history.length - 1] ?? "";
    return previousFocusedNodeId
      ? { focusedNodeId: previousFocusedNodeId, history: state.history.slice(0, -1) }
      : { focusedNodeId: "", history: [] };
  }

  const existingHistoryIndex = state.history.indexOf(nextNodeId);
  if (existingHistoryIndex !== -1) {
    return {
      focusedNodeId: nextNodeId,
      history: state.history.slice(0, existingHistoryIndex)
    };
  }

  return {
    focusedNodeId: nextNodeId,
    history: state.focusedNodeId ? [...state.history, state.focusedNodeId] : []
  };
}
