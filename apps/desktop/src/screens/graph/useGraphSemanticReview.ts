import { useEffect, useMemo, useState } from "react";
import type { AssistantPolicy, SemanticGraphScope } from "@zharwing/memory-core";
import { useStore } from "../../stores/store-context.js";
import { useSemanticRunDraft } from "../../features/semantic-review/index.js";
import { formatShortDateTime } from "../../utils/format.js";
import { routePath } from "../../utils/routes.js";
import {
  durableSemanticEdgeId,
  proposedSemanticEdgeTarget,
  semanticScopeKey,
  semanticScopeSummary
} from "../../features/graph/semantic/semantic-review-adapter.js";
import type { GraphMapEdge } from "./graph-flow-model.js";

export interface SemanticPreviewState {
  scopeKey: string;
  status: "idle" | "loading" | "done" | "failed";
  error?: string;
}

interface UseGraphSemanticReviewOptions {
  selectedEdge?: GraphMapEdge;
  focusedNodeId: string;
  focusLabel?: string;
  isRawGraph: boolean;
  onClearSelectedEdge: () => void;
}

export function useGraphSemanticReview({
  selectedEdge,
  focusedNodeId,
  focusLabel,
  isRawGraph,
  onClearSelectedEdge
}: UseGraphSemanticReviewOptions) {
  const store = useStore();
  const {
    draft,
    patchDraft,
    toPayload
  } = useSemanticRunDraft({ scopeKind: "focused" });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewState, setPreviewState] = useState<SemanticPreviewState>({
    scopeKey: "",
    status: "idle"
  });

  const selectedScope = useMemo<SemanticGraphScope>(() => {
    if (draft.scopeKind === "changed-docs") return { kind: "changed-docs" };
    if (draft.scopeKind === "focused" && focusedNodeId && !isRawGraph) {
      return { kind: "focused-graph-node", nodeId: focusedNodeId };
    }
    return { kind: "all-docs" };
  }, [draft.scopeKind, focusedNodeId, isRawGraph]);

  const selectedScopeKey = semanticScopeKey(selectedScope);
  const scopeCopy = semanticScopeSummary(selectedScope, focusLabel);
  const preview = store.semantic.analysisPreview;
  const previewForSelectedScope = preview && semanticScopeKey(preview.scope) === selectedScopeKey
    ? preview
    : undefined;
  const previewStateForSelectedScope = previewState.scopeKey === selectedScopeKey
    ? previewState
    : undefined;

  const proposedEdge = proposedSemanticEdgeTarget(selectedEdge?.semanticEdgeId);
  const durableEdgeId = durableSemanticEdgeId(selectedEdge?.semanticEdgeId);
  const selectedEdgeIsSemantic = Boolean(selectedEdge?.sourceKind?.includes("semantic"));
  const canAcceptSelectedEdge = Boolean(
    proposedEdge ||
    (
      durableEdgeId &&
      selectedEdge?.semanticStatus !== "accepted" &&
      selectedEdge?.semanticStatus !== "auto-accepted"
    )
  );
  const canHideSelectedEdge = Boolean(durableEdgeId);

  const assistantPolicy: Partial<AssistantPolicy> =
    store.projects.summary?.project?.assistantPolicy ||
    store.projects.selectedProject?.assistantPolicy ||
    {};
  const providerEndpoint = assistantPolicy.endpoint || "";
  const providerModel = store.semantic.settings?.model || assistantPolicy.modelName || "";
  const providerReady = Boolean(providerEndpoint && providerModel);
  const latestRun = store.semantic.status?.runCounts?.latest;

  useEffect(() => {
    if (!focusedNodeId && draft.scopeKind === "focused") {
      patchDraft({ scopeKind: "all-docs" });
    }
  }, [draft.scopeKind, focusedNodeId]);

  async function previewAnalysis() {
    const scopeKey = semanticScopeKey(selectedScope);
    setPreviewState({ scopeKey, status: "loading" });
    const nextPreview = await store.semantic.previewAnalysis(selectedScope);
    if (nextPreview) {
      setPreviewState({ scopeKey, status: "done" });
      return;
    }
    setPreviewState({
      scopeKey,
      status: "failed",
      error: store.semantic.error || "Unable to estimate this target."
    });
  }

  function runAnalysis() {
    void store.semantic.analyze(toPayload({
      scope: { ...selectedScope },
      fallbackMode: "dry-run"
    }));
  }

  async function acceptSelectedEdge() {
    if (proposedEdge) {
      await store.semantic.acceptEdgesProposal(proposedEdge.proposalId, {
        edgeIndexes: [proposedEdge.edgeIndex]
      });
      onClearSelectedEdge();
      return;
    }

    if (durableEdgeId) {
      await store.semantic.updateEdgeStatus([durableEdgeId], "accepted");
      onClearSelectedEdge();
    }
  }

  async function hideSelectedEdge() {
    if (!durableEdgeId) return;
    await store.semantic.updateEdgeStatus([durableEdgeId], "rejected");
    onClearSelectedEdge();
  }

  return {
    model: {
      loading: store.semantic.loading,
      projectId: store.projects.selectedProjectId,
      provider: {
        endpoint: providerEndpoint,
        model: providerModel,
        ready: providerReady,
        assistantRoute: routePath("assistant", { projectId: store.projects.selectedProjectId })
      },
      latestRun: {
        started: latestRun?.started,
        startedLabel: latestRun?.started ? formatShortDateTime(latestRun.started) : "",
        statusLabel: latestRun?.status || "No runs"
      },
      edgeCounts: store.semantic.edgeCounts,
      result: store.semantic.analysisResult,
      draft,
      scopeCopy,
      preview: previewForSelectedScope,
      previewState: previewStateForSelectedScope,
      showAdvanced,
      showPreviewDialog,
      selectedEdgeReview: {
        isSemantic: selectedEdgeIsSemantic,
        canAccept: canAcceptSelectedEdge,
        canHide: canHideSelectedEdge,
        proposalRoute: proposedEdge
          ? routePath("inbox", {
              projectId: store.projects.selectedProjectId,
              query: { proposal: proposedEdge.proposalId }
            })
          : undefined
      }
    },
    actions: {
      patchDraft,
      runAnalysis,
      previewAnalysis,
      acceptSelectedEdge,
      hideSelectedEdge,
      toggleAdvanced: () => setShowAdvanced((open) => !open),
      openPreviewDialog: () => setShowPreviewDialog(true),
      closePreviewDialog: () => setShowPreviewDialog(false)
    }
  };
}

export type GraphSemanticReviewController = ReturnType<typeof useGraphSemanticReview>;
