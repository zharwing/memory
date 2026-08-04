import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import { CircleHelp, FlaskConical, Play, RotateCcw, Settings2, X } from "lucide-react";
import { PROVIDER_DEFAULTS, type AssistantPolicy } from "@zharwing/memory-core";
import { useStore } from "../../stores/store-context.js";
import type { GraphRelationshipMode } from "../../stores/graph-store.js";
import { Empty, KeyValue, Screen } from "../../components/layout.js";
import { LibraryTabs } from "../../components/SectionTabs.js";
import { DocumentEditorHost } from "../../components/DocumentEditorHost.js";
import { Modal } from "../../components/Modal.js";
import { ToggleGroup } from "../../components/ToggleGroup.js";
import { useCloseWhenMissing, useSearchParamsPatch } from "../../hooks/useSearchParamState.js";
import { SemanticRunForm, useSemanticRunDraft } from "../../features/semantic-review/index.js";
import { formatConfidence, formatShortDateTime, titleCaseSlug } from "../../utils/format.js";
import {
  type GraphViewMode,
  enhanceGraphForDisplay,
  getGraphFocusOptions,
  getGraphStats,
  graphEdgeLabel,
} from "./graph-display.js";
import { GraphMap, graphNodeVisualStyle, removeStoredGraphNodePositions } from "./GraphMap.js";
import { buildGraphFlowElements, graphNodeVisualKind, type GraphMapEdge, type GraphMapNode, RawStorageAudit } from "./graph-flow.js";
import { projectPath } from "../../utils/routes.js";

const GRAPH_POSITION_STORAGE_PREFIX = "aimem.graph.positions.d3.v2";
const GRAPH_LEGEND_PRIORITY = [
  "project",
  "repo",
  "workstream",
  "service",
  "package",
  "topic",
  "diagram-group",
  "doc",
  "diagram",
  "decision",
  "command",
  "gotcha",
  "session",
  "task",
  "file",
  "external-reference"
] as const;
const GRAPH_LEGEND_RANK = new Map<string, number>(GRAPH_LEGEND_PRIORITY.map((kind, index) => [kind, index]));
const GRAPH_LEGEND_LABELS: Record<string, string> = {
  project: "Project",
  repo: "Repo",
  workstream: "Workstream",
  service: "Service",
  package: "Package",
  topic: "Topic",
  "diagram-group": "Diagram group",
  doc: "Document",
  diagram: "Diagram",
  decision: "Decision",
  command: "Command",
  gotcha: "Gotcha",
  session: "Session",
  task: "Task",
  file: "File",
  "external-reference": "External"
};

type GraphLegendItem = { kind: string; label: string; count: number };
type SemanticPreviewState = {
  scopeKey: string;
  status: "idle" | "loading" | "done" | "failed";
  error?: string;
};

export const GraphScreen = observer(function GraphScreen() {
  const store = useStore();
  const [searchParams, patchSearchParams] = useSearchParamsPatch();
  const graph = useMemo(() => enhanceGraphForDisplay(store.graph.data, store.docs.list), [store.graph.data, store.docs.list]);
  const graphViewMode: GraphViewMode = searchParams.get("view") === "all" ? "all" : "context";
  const rawRelationshipModeParam = searchParams.get("relationships");
  const focusedNodeId = graphViewMode === "all" ? "" : searchParams.get("focus") || "";
  const editingDocId = searchParams.get("doc") || "";
  const selectedGraphEdgeId = searchParams.get("edge") || "";
  const [focusHistory, setFocusHistory] = useState<string[]>([]);
  const [showGraphHelp, setShowGraphHelp] = useState(false);
  const [showGraphDetails, setShowGraphDetails] = useState(false);
  const {
    draft: semanticRunDraft,
    patchDraft: updateSemanticRunDraft,
    setDraft: setSemanticRunDraft,
    toPayload: semanticRunPayloadFor
  } = useSemanticRunDraft({ scopeKind: "focused" });
  const [showSemanticAdvanced, setShowSemanticAdvanced] = useState(false);
  const [showSemanticPreviewDialog, setShowSemanticPreviewDialog] = useState(false);
  const [semanticPreviewState, setSemanticPreviewState] = useState<SemanticPreviewState>({
    scopeKey: "",
    status: "idle"
  });
  const [layoutVersion, setLayoutVersion] = useState(0);
  const graphStats = useMemo(() => getGraphStats(graph), [graph]);
  const focusOptions = useMemo(() => getGraphFocusOptions(graph), [graph]);
  const graphElements = useMemo(() => buildGraphFlowElements(graph, graphViewMode, focusedNodeId), [graph, graphViewMode, focusedNodeId]);
  const graphLegendItems = useMemo(() => buildGraphLegendItems(graphElements.nodes), [graphElements.nodes]);
  const graphElementNodeById = useMemo(() => new Map(graphElements.nodes.map((node) => [node.id, node])), [graphElements.nodes]);
  const graphElementEdgeIds = useMemo(() => new Set(graphElements.edges.map((edge) => edge.id)), [graphElements.edges]);
  const selectedGraphEdge = useMemo(
    () => graphElements.edges.find((edge) => edge.id === selectedGraphEdgeId),
    [graphElements.edges, selectedGraphEdgeId]
  );
  const selectedProposedSemanticEdge = proposedSemanticEdgeTarget(selectedGraphEdge?.semanticEdgeId);
  const selectedDurableSemanticEdgeId = durableSemanticEdgeId(selectedGraphEdge?.semanticEdgeId);
  const selectedGraphEdgeIsSemantic = Boolean(selectedGraphEdge?.sourceKind?.includes("semantic"));
  const canAcceptSelectedSemanticEdge = Boolean(
    selectedProposedSemanticEdge ||
    (
      selectedDurableSemanticEdgeId &&
      selectedGraphEdge?.semanticStatus !== "accepted" &&
      selectedGraphEdge?.semanticStatus !== "auto-accepted"
    )
  );
  const canHideSelectedSemanticEdge = Boolean(selectedDurableSemanticEdgeId);
  const graphProjectId = store.projects.selectedProjectId || String(graph?.projectId || "project");
  const graphNodeById = useMemo<Map<string, any>>(
    () => new Map((Array.isArray(graph?.nodes) ? graph.nodes : []).map((node: any) => [String(node.id || ""), node])),
    [graph]
  );
  const graphNodeIds = useMemo(() => new Set((Array.isArray(graph?.nodes) ? graph.nodes : []).map((node: any) => String(node.id || ""))), [graph]);
  const graphRelationshipMode = store.graph.relationshipMode;
  const graphRelationshipLabel = graphRelationshipModeLabel(graphRelationshipMode);
  const graphPositionKey = `${GRAPH_POSITION_STORAGE_PREFIX}:${graphProjectId}:${graphViewMode}:${graphRelationshipMode}:${focusedNodeId || "overview"}`;
  const isRawGraph = graphViewMode === "all";
  const editingDoc = store.docs.list.find((doc) => doc.id === editingDocId);
  const focusedGraphNode = focusedNodeId ? graphNodeById.get(focusedNodeId) : undefined;
  const graphScopeLabel = isRawGraph ? "Import audit" : focusedNodeId ? `Focused: ${graphElements.focusLabel || "selected node"}` : "Context map";
  const graphNodeCount = isRawGraph ? graphStats.nodes : graphElements.nodes.length;
  const graphLinkCount = isRawGraph ? graphStats.relationships : graphElements.edges.length;
  const graphHiddenCount = isRawGraph ? graphStats.memberships : graphElements.hiddenMemberships + graphElements.hiddenLeafNodes;
  const graphGeneratedLabel = graph?.generated ? `${graph.displayProjected ? "Projected" : "Generated"} ${formatShortDateTime(graph.generated)}` : "";
  const semanticEdgeCounts = store.semantic.edgeCounts;
  const semanticLatestRun = store.semantic.status?.runCounts?.latest;
  const semanticLatestRunStartedLabel = semanticLatestRun?.started ? formatShortDateTime(semanticLatestRun.started) : "";
  const semanticLatestRunStatusLabel = semanticLatestRun?.status || "No runs";
  const semanticResult = store.semantic.analysisResult;
  const assistantPolicy: Partial<AssistantPolicy> = store.projects.summary?.project?.assistantPolicy || store.projects.selectedProject?.assistantPolicy || {};
  const semanticProviderEndpoint = semanticRunDraft.endpoint.trim() || assistantPolicy.endpoint || "";
  const semanticProviderModel = semanticRunDraft.model.trim() || store.semantic.settings?.model || assistantPolicy.modelName || "";
  const semanticProviderReady = Boolean(semanticProviderEndpoint && semanticProviderModel);
  const semanticSelectedScope = semanticAnalysisScope();
  const semanticSelectedScopeKey = semanticScopeKey(semanticSelectedScope);
  const semanticScopeCopy = semanticScopeSummary(semanticSelectedScope, graphElements.focusLabel);
  const semanticPreview = store.semantic.analysisPreview;
  const semanticPreviewForSelectedScope = semanticPreview &&
    semanticScopeKey(semanticPreview.scope) === semanticSelectedScopeKey
      ? semanticPreview
      : undefined;
  const semanticPreviewStateForSelectedScope = semanticPreviewState.scopeKey === semanticSelectedScopeKey
    ? semanticPreviewState
    : undefined;

  useEffect(() => {
    if (rawRelationshipModeParam && !graphRelationshipModeFromSearchParam(rawRelationshipModeParam)) {
      patchSearchParams({ relationships: null }, { replace: true });
      return;
    }
    const nextGraphRelationshipMode = graphRelationshipModeFromSearchParam(rawRelationshipModeParam) || "ai-reviewed";
    if (nextGraphRelationshipMode !== store.graph.relationshipMode) {
      void store.graph.setRelationshipMode(nextGraphRelationshipMode);
    }
  }, [searchParams]);

  useCloseWhenMissing(
    focusedNodeId,
    graphNodeIds.size > 0 && (!graphNodeIds.has(focusedNodeId) || String(focusedGraphNode?.type || "") === "project"),
    () => {
      setFocusHistory([]);
      updateGraphSearchParams({ focus: null }, true);
    }
  );

  useCloseWhenMissing(
    editingDocId,
    store.docs.list.length > 0 && !store.docs.list.some((doc) => doc.id === editingDocId),
    () => updateGraphSearchParams({ doc: null }, true)
  );

  useCloseWhenMissing(
    selectedGraphEdgeId,
    graphElementEdgeIds.size > 0 && !graphElementEdgeIds.has(selectedGraphEdgeId),
    () => updateGraphSearchParams({ edge: null }, true)
  );

  useEffect(() => {
    setSemanticRunDraft((current) => ({
      ...current,
      endpoint: current.endpoint || assistantPolicy.endpoint || "",
      model: current.model || store.semantic.settings?.model || assistantPolicy.modelName || ""
    }));
  }, [store.projects.selectedProjectId, store.semantic.settings?.model, assistantPolicy.endpoint, assistantPolicy.modelName]);

  useEffect(() => {
    if (!focusedNodeId && semanticRunDraft.scopeKind === "focused") {
      updateSemanticRunDraft({ scopeKind: "all-docs" });
    }
  }, [focusedNodeId, semanticRunDraft.scopeKind]);

  function updateGraphSearchParams(nextState: {
    viewMode?: GraphViewMode;
    relationshipMode?: GraphRelationshipMode;
    focus?: string | null;
    doc?: string | null;
    edge?: string | null;
  }, replace = false) {
    const patch: Record<string, string | null | undefined> = {};
    if (nextState.viewMode) patch.view = nextState.viewMode === "all" ? "all" : null;
    if (nextState.relationshipMode) {
      patch.relationships = nextState.relationshipMode === "ai-reviewed" ? null : nextState.relationshipMode;
    }
    if (nextState.focus !== undefined) patch.focus = nextState.focus;
    if (nextState.doc !== undefined) patch.doc = nextState.doc;
    if (nextState.edge !== undefined) patch.edge = nextState.edge;
    patchSearchParams(patch, { replace });
  }

  function resetGraphFocus() {
    setFocusHistory([]);
    updateGraphSearchParams({ viewMode: "context", focus: null });
  }

  function setGraphFocusFromControl(nextNodeId: string) {
    setFocusHistory([]);
    updateGraphSearchParams({ viewMode: "context", focus: nextNodeId || null });
  }

  function navigateGraphFocus(nextNodeId: string) {
    const nextNode = graphNodeById.get(nextNodeId);
    if (!nextNodeId || String(nextNode?.type || "") === "project") {
      resetGraphFocus();
      return;
    }

    if (nextNodeId === focusedNodeId) {
      const previousFocusedNodeId = focusHistory[focusHistory.length - 1] || "";
      if (previousFocusedNodeId) {
        const nextHistory = focusHistory.slice(0, -1);
        setFocusHistory(nextHistory);
        updateGraphSearchParams({ viewMode: "context", focus: previousFocusedNodeId });
        return;
      }

      resetGraphFocus();
      return;
    }

    const existingHistoryIndex = focusHistory.indexOf(nextNodeId);
    if (existingHistoryIndex !== -1) {
      setFocusHistory(focusHistory.slice(0, existingHistoryIndex));
      updateGraphSearchParams({ viewMode: "context", focus: nextNodeId });
      return;
    }

    setFocusHistory(focusedNodeId ? [...focusHistory, focusedNodeId] : []);
    updateGraphSearchParams({ viewMode: "context", focus: nextNodeId });
  }

  function openGraphDocument(documentId: string) {
    updateGraphSearchParams({ doc: documentId });
  }

  function closeGraphDocument() {
    updateGraphSearchParams({ doc: null });
  }

  function selectGraphEdge(edge: GraphMapEdge) {
    setShowGraphDetails(true);
    updateGraphSearchParams({ edge: edge.id });
  }

  function clearSelectedGraphEdge() {
    updateGraphSearchParams({ edge: null });
  }

  const resetGraphLayout = useCallback(() => {
    removeStoredGraphNodePositions(graphPositionKey);
    setLayoutVersion((currentVersion) => currentVersion + 1);
  }, [graphPositionKey]);

  function semanticAnalysisScope() {
    if (semanticRunDraft.scopeKind === "changed-docs") return { kind: "changed-docs" };
    if (semanticRunDraft.scopeKind === "focused" && focusedNodeId && !isRawGraph) {
      return { kind: "focused-graph-node", nodeId: focusedNodeId };
    }
    return { kind: "all-docs" };
  }

  async function previewSemanticAnalysis() {
    const scope = semanticAnalysisScope();
    const scopeKey = semanticScopeKey(scope);
    setSemanticPreviewState({ scopeKey, status: "loading" });
    const preview = await store.semantic.previewAnalysis(scope);
    if (preview) {
      setSemanticPreviewState({ scopeKey, status: "done" });
      return;
    }
    setSemanticPreviewState({
      scopeKey,
      status: "failed",
      error: store.semantic.error || "Unable to estimate this target."
    });
  }

  function runSemanticAnalysis() {
    void store.semantic.analyze(semanticRunPayloadFor({
      scope: semanticAnalysisScope(),
      fallbackMode: "dry-run"
    }));
  }

  async function acceptSelectedSemanticEdge() {
    if (selectedProposedSemanticEdge) {
      await store.semantic.acceptEdgesProposal(selectedProposedSemanticEdge.proposalId, {
        edgeIndexes: [selectedProposedSemanticEdge.edgeIndex]
      });
      clearSelectedGraphEdge();
      return;
    }

    if (selectedDurableSemanticEdgeId) {
      await store.semantic.updateEdgeStatus([selectedDurableSemanticEdgeId], "accepted");
      clearSelectedGraphEdge();
    }
  }

  async function hideSelectedSemanticEdge() {
    if (!selectedDurableSemanticEdgeId) return;
    await store.semantic.updateEdgeStatus([selectedDurableSemanticEdgeId], "rejected");
    clearSelectedGraphEdge();
  }

  return (
    <Screen title="Graph">
      <LibraryTabs />
      <div className="graph-view-toolbar">
        <ToggleGroup
          className="segmented-control compact graph-mode-control"
          role="group"
          ariaLabel="Graph view"
          value={graphViewMode}
          onChange={(nextMode) => {
            if (nextMode === "all") {
              setFocusHistory([]);
              updateGraphSearchParams({ viewMode: "all", focus: null });
            } else {
              updateGraphSearchParams({ viewMode: "context" });
            }
          }}
          options={[
            { value: "context", label: "Context map" },
            { value: "all", label: "Import audit" }
          ]}
        />
        <label className="graph-focus-control">
          <span>Focus</span>
          <select
            value={focusedNodeId}
            disabled={isRawGraph || focusOptions.length === 0}
            onChange={(event) => {
              setGraphFocusFromControl(event.target.value);
            }}
          >
            <option value="">Overview hubs</option>
            {focusOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        {focusedNodeId && !isRawGraph ? (
          <button
            className="icon-text-button"
            type="button"
            onClick={resetGraphFocus}
          >
            <X size={14} />
            Reset focus
          </button>
        ) : null}
        {!isRawGraph && graphElements.nodes.length ? (
          <button
            className="icon-text-button"
            type="button"
            onClick={resetGraphLayout}
          >
            <RotateCcw size={14} />
            Reset layout
          </button>
        ) : null}
        <button
          type="button"
          className={`icon-button icon-only graph-help-trigger ${showGraphHelp ? "selected" : ""}`}
          onClick={() => setShowGraphHelp((open) => !open)}
          title="About graph views"
          aria-label="About graph views"
          aria-expanded={showGraphHelp}
        >
          <CircleHelp size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="graph-status-row" aria-label="Graph status">
        <strong>{graphScopeLabel}</strong>
        <span>{graphNodeCount} {isRawGraph ? "stored nodes" : "visible nodes"}</span>
        <span>{graphLinkCount} {isRawGraph ? "context links" : "visible links"}</span>
        <span>{graphRelationshipLabel}</span>
        <span>{graphHiddenCount} {isRawGraph ? "ownership links" : "hidden"}</span>
        {graphGeneratedLabel ? <span>{graphGeneratedLabel}</span> : null}
      </div>
      {showGraphHelp ? (
        <div className="notice graph-explainer compact">
          <strong>Context graph, not storage inventory</strong>
          <p>
            Context map shows saved relationships only. AI suggestions stay in Inbox until you accept them, then they appear here as part of the trusted graph.
          </p>
        </div>
      ) : null}
      <div className="graph-board">
        <div className="graph-board-details">
          <button
            type="button"
            className={`graph-details-toggle ${showGraphDetails ? "selected" : ""}`}
            onClick={() => setShowGraphDetails((open) => !open)}
            aria-expanded={showGraphDetails}
            title={showGraphDetails ? "Hide the graph details and AI relationship review panel." : "Show graph details, relationship counts, and AI review controls."}
          >
            {showGraphDetails ? "Hide details" : "Details"}
          </button>
          {showGraphDetails ? (
            <div className="graph-details-popover">
              <div className={`graph-mode-note ${isRawGraph ? "warning" : ""}`}>
                {isRawGraph ? (
                  <>
                    <strong>Import audit:</strong> stored records, project ownership links, and derived context relationships.
                  </>
                ) : focusedNodeId ? (
                  <>
                    <strong>Focused neighborhood:</strong> nearby saved relationships around {graphElements.focusLabel || "the selected node"}.
                  </>
                ) : (
                  <>
                    <strong>Context map:</strong> saved relationships only, with leaf docs hidden until a node is focused.
                  </>
                )}
              </div>
              {!isRawGraph && graphElements.edgeTypes.length ? (
                <div className="graph-edge-summary" aria-label="Relationship summary">
                  {graphElements.edgeTypes.map((item) => (
                    <span key={item.type}>{graphEdgeLabel(item.type)} {item.count}</span>
                  ))}
                </div>
              ) : null}
              {!isRawGraph && graphLegendItems.length ? (
                <div className="graph-legend" aria-label="Graph legend">
                  {graphLegendItems.map((item) => {
                    const colors = graphNodeVisualStyle(item.kind);
                    return (
                    <span key={item.kind}>
                      <i
                        className="graph-legend-dot"
                        style={{
                          background: colors.fill,
                          borderColor: colors.accent
                        }}
                        aria-hidden="true"
                      />
                      {item.label}
                      <small className="graph-legend-count">{item.count}</small>
                    </span>
                    );
                  })}
                </div>
              ) : null}
              {selectedGraphEdge ? (
                <div className="graph-edge-inspector">
                  <div className="graph-edge-inspector-header">
                    <strong>Selected relationship</strong>
                    <button
                      type="button"
                      className="icon-button icon-only"
                      onClick={clearSelectedGraphEdge}
                      title="Clear selected relationship"
                      aria-label="Clear selected relationship"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="semantic-graph-mini-stats">
                    <KeyValue label="From" value={graphElementNodeById.get(selectedGraphEdge.source)?.label || selectedGraphEdge.source} />
                    <KeyValue label="To" value={graphElementNodeById.get(selectedGraphEdge.target)?.label || selectedGraphEdge.target} />
                    <KeyValue label="Type" value={graphEdgeLabel(selectedGraphEdge.type)} />
                    <KeyValue label="Source" value={selectedGraphEdge.sourceKind?.includes("semantic") ? "Semantic" : "Deterministic"} />
                    {selectedGraphEdge.semanticStatus ? <KeyValue label="Status" value={selectedGraphEdge.semanticStatus} /> : null}
                    {typeof selectedGraphEdge.confidence === "number" ? (
                      <KeyValue label="Confidence" value={formatConfidence(selectedGraphEdge.confidence)} />
                    ) : null}
                  </div>
                  {selectedGraphEdge.reason ? (
                    <div className="graph-edge-reason">
                      <span>Reason</span>
                      <p>{selectedGraphEdge.reason}</p>
                    </div>
                  ) : null}
                  {selectedGraphEdge.evidence?.length ? (
                    <div className="graph-edge-evidence">
                      <span>Evidence</span>
                      {selectedGraphEdge.evidence.slice(0, 3).map((item, index) => (
                        <blockquote key={`${selectedGraphEdge.id}-evidence-${index}`}>
                          {item.quote || "Evidence recorded without quote"}
                          {item.sourcePath || item.documentId ? (
                            <cite>{[item.sourcePath, item.documentId].filter(Boolean).join(" / ")}</cite>
                          ) : null}
                        </blockquote>
                      ))}
                    </div>
                  ) : null}
                  {selectedGraphEdgeIsSemantic && selectedGraphEdge.semanticEdgeId ? (
                    <div className="graph-edge-actions" aria-label="Selected semantic relationship actions">
                      {canAcceptSelectedSemanticEdge ? (
                        <button
                          type="button"
                          disabled={store.semantic.loading}
                          onClick={() => void acceptSelectedSemanticEdge()}
                          title="Accept this suggested semantic relationship so it becomes a saved graph link."
                        >
                          Accept Edge
                        </button>
                      ) : null}
                      {canHideSelectedSemanticEdge ? (
                        <button
                          type="button"
                          className="danger-button"
                          disabled={store.semantic.loading}
                          onClick={() => void hideSelectedSemanticEdge()}
                          title="Hide this semantic relationship by marking it rejected."
                        >
                          Hide Edge
                        </button>
                      ) : null}
                      {selectedProposedSemanticEdge ? (
                        <Link
                          className="button-link"
                          to={projectPath(store.projects.selectedProjectId, `/inbox?proposal=${encodeURIComponent(selectedProposedSemanticEdge.proposalId)}`)}
                          title="Open the Inbox proposal that contains this suggested relationship."
                        >
                          Open Inbox
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {!isRawGraph ? (
                <div className="semantic-analysis-panel">
                  <div className="semantic-review-header">
                    <strong>AI relationship review</strong>
                    <div className="semantic-review-meta">
                      <span>{semanticLatestRunStatusLabel}</span>
                      {semanticLatestRunStartedLabel ? (
                        <time dateTime={semanticLatestRun?.started}>{semanticLatestRunStartedLabel}</time>
                      ) : null}
                    </div>
                  </div>
                  <div className="semantic-review-stats" aria-label="AI relationship review summary">
                    <div className="semantic-review-stat">
                      <span>Accepted</span>
                      <strong>{(semanticEdgeCounts.accepted || 0) + (semanticEdgeCounts["auto-accepted"] || 0)}</strong>
                    </div>
                    <div className="semantic-review-stat">
                      <span>Proposed</span>
                      <strong>{semanticEdgeCounts.proposed || 0}</strong>
                    </div>
                  </div>
                  <div className="semantic-provider-strip">
                    <span>{semanticProviderReady ? `${semanticProviderModel} at ${semanticProviderEndpoint}` : "Provider not configured"}</span>
                    <Link
                      className="button-link compact-link"
                      to={projectPath(store.projects.selectedProjectId, "/assistant")}
                      title="Open Assistant settings to configure the provider and model used by AI relationship review."
                    >
                      Assistant
                    </Link>
                  </div>
                  <div className="semantic-run-form semantic-run-form-basic">
                    <label>
                      <span>Review target</span>
                      <select
                        value={semanticRunDraft.scopeKind}
                        disabled={store.semantic.loading}
                        onChange={(event) => updateSemanticRunDraft({ scopeKind: event.target.value })}
                      >
                        <option value="focused" disabled={!focusedNodeId || isRawGraph}>Focused node</option>
                        <option value="changed-docs">Changed docs</option>
                        <option value="all-docs">Project</option>
                      </select>
                      <small>{semanticScopeCopy.title}. {semanticScopeCopy.detail}</small>
                    </label>
                  </div>
                  <div className="semantic-run-actions primary">
                    <button
                      type="button"
                      className="icon-text-button primary"
                      disabled={!store.projects.selectedProjectId || store.semantic.loading || !semanticProviderReady}
                      onClick={runSemanticAnalysis}
                      title="Run AI relationship review for the selected target. This calls the configured model and may create Inbox proposals."
                    >
                      <Play size={14} />
                      Run review
                    </button>
                    <div className="semantic-run-secondary-actions">
                      <button
                        type="button"
                        className="icon-text-button"
                        disabled={!store.projects.selectedProjectId || store.semantic.loading}
                        onClick={() => setShowSemanticPreviewDialog(true)}
                        title="Estimate how many docs and candidate relationships this target will process. This does not call the AI model or change the graph."
                      >
                        <FlaskConical size={14} />
                        {semanticPreviewStateForSelectedScope?.status === "loading" ? "Estimating..." : "Estimate docs"}
                      </button>
                      <button
                        type="button"
                        className={`icon-text-button ${showSemanticAdvanced ? "selected" : ""}`}
                        disabled={store.semantic.loading}
                        onClick={() => setShowSemanticAdvanced((open) => !open)}
                        aria-expanded={showSemanticAdvanced}
                        title="Show provider overrides, limits, timeouts, and JSON response settings for the next review run."
                      >
                        <Settings2 size={14} />
                        Advanced
                      </button>
                    </div>
                  </div>
                  {showSemanticAdvanced ? (
                    <div className="semantic-run-advanced">
                      <SemanticRunForm
                        draft={semanticRunDraft}
                        disabled={store.semantic.loading}
                        onPatch={updateSemanticRunDraft}
                        fields={[
                          { key: "mode" },
                          { key: "endpoint", placeholder: assistantPolicy.endpoint || PROVIDER_DEFAULTS["lm-studio"].endpoint },
                          { key: "model", placeholder: store.semantic.settings?.model || assistantPolicy.modelName || "local model" },
                          { key: "apiKey", placeholder: "optional" },
                          { key: "maxDocuments", placeholder: "all" },
                          { key: "maxCandidates", placeholder: "all" },
                          { key: "maxCandidatesPerDocument" },
                          { key: "timeoutSeconds" },
                          { key: "maxOutputTokens" },
                          { key: "jsonMode" }
                        ]}
                      />
                    </div>
                  ) : null}
                  {semanticPreviewStateForSelectedScope?.status === "loading" ? (
                    <div className="semantic-run-preview pending" aria-live="polite">
                      <strong>{semanticScopeCopy.title}</strong>
                      <span>Estimating eligible docs and candidate links...</span>
                    </div>
                  ) : semanticPreviewStateForSelectedScope?.status === "failed" ? (
                    <div className="semantic-run-preview failed" aria-live="polite">
                      <strong>{semanticScopeCopy.title}</strong>
                      <span>{semanticPreviewStateForSelectedScope.error || "Unable to estimate this target."}</span>
                    </div>
                  ) : semanticPreviewForSelectedScope ? (
                    <div className="semantic-run-preview" aria-label="Review target preview">
                      <strong>{semanticScopeCopy.title}</strong>
                      <span><b>{semanticPreviewForSelectedScope.counts?.documentsEligible ?? 0}</b> eligible</span>
                      <span><b>{semanticPreviewForSelectedScope.counts?.baselineExtractions ?? 0}</b> new</span>
                      <span><b>{semanticPreviewForSelectedScope.counts?.cachedExtractions ?? 0}</b> cached</span>
                      <span><b>{semanticPreviewForSelectedScope.counts?.candidates ?? 0}</b> candidates</span>
                    </div>
                  ) : null}
                  {semanticResult?.run ? (
                    <div className="semantic-run-result">
                      <div className="semantic-analysis-header">
                        <strong>{semanticResult.run.status}</strong>
                        <span>{semanticResult.run.mode}</span>
                      </div>
                      <div className="semantic-graph-mini-stats">
                        <KeyValue label="Target" value={semanticScopeLabel(semanticResult.run.scope, graphElements.focusLabel)} />
                        <KeyValue label="Docs" value={`${semanticResult.run.counts?.documentsAnalyzed || 0} new / ${semanticResult.run.counts?.extractionsReused || 0} cached`} />
                        <KeyValue label="Judged" value={semanticResult.run.counts?.judged || 0} />
                        <KeyValue label="Accepted" value={semanticResult.run.counts?.accepted || 0} />
                        <KeyValue label="Proposed" value={semanticResult.run.counts?.proposed || 0} />
                        <KeyValue label="Discarded" value={semanticResult.run.counts?.discarded || 0} />
                        <KeyValue label="Proposal" value={semanticResult.proposal?.id || "None"} />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {showSemanticPreviewDialog ? (
                <Modal
                  ariaLabel="Estimate review target"
                  backdropClassName="dialog-backdrop graph-confirm-backdrop"
                  className="confirm-dialog graph-preview-dialog"
                  onClose={() => setShowSemanticPreviewDialog(false)}
                >
                    <h3>Estimate Review Target?</h3>
                    <p>
                      This checks <strong>{semanticScopeCopy.title}</strong> and reports how many docs and candidate relationships would be included.
                    </p>
                    <p>
                      It does not call the AI model, create Inbox proposals, accept links, or change the graph.
                    </p>
                    <div className="button-row">
                      <button
                        type="button"
                        onClick={() => setShowSemanticPreviewDialog(false)}
                        title="Close this dialog without estimating the target."
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="icon-text-button primary"
                        disabled={store.semantic.loading}
                        onClick={() => {
                          setShowSemanticPreviewDialog(false);
                          void previewSemanticAnalysis();
                        }}
                        title="Start the estimate. This does not call the AI model or change graph relationships."
                      >
                        Start estimate
                      </button>
                    </div>
                </Modal>
              ) : null}
            </div>
          ) : null}
        </div>
        {isRawGraph ? (
          <RawStorageAudit graph={graph} />
        ) : graphElements.edges.length ? (
          <GraphMap
            nodes={graphElements.nodes}
            edges={graphElements.edges}
            focusedNodeId={focusedNodeId}
            storageKey={graphPositionKey}
            layoutVersion={layoutVersion}
            onOpenDocument={openGraphDocument}
            onFocusNode={navigateGraphFocus}
            onSelectEdge={selectGraphEdge}
          />
        ) : focusedNodeId && graphStats.relationships > 0 ? (
          <Empty
            className="graph-empty-state"
            title="No links for this focus"
            body="This item has no visible saved links in the current graph view. Reset focus to see the accepted relationship map."
            action={<button type="button" onClick={resetGraphFocus}>Show full graph</button>}
          />
        ) : (
          <Empty
            className="graph-empty-state"
            title="No saved relationships yet"
            body="AI may have suggestions waiting, but the graph only shows relationships after you accept them. Review the Inbox first; accepted links will appear here."
            action={<Link className="button-link" to={projectPath(store.projects.selectedProjectId, "/inbox")}>Review Inbox</Link>}
          />
        )}
      </div>
      {editingDoc ? (
        <DocumentEditorHost doc={editingDoc} onClose={closeGraphDocument} />
      ) : null}
    </Screen>
  );
});

function buildGraphLegendItems(nodes: GraphMapNode[]): GraphLegendItem[] {
  const itemsByKind = new Map<string, GraphLegendItem>();
  for (const node of nodes) {
    const kind = graphNodeVisualKind(node);
    const item = itemsByKind.get(kind);
    if (item) {
      item.count += 1;
      continue;
    }
    itemsByKind.set(kind, {
      kind,
      label: graphLegendLabel(kind, node),
      count: 1
    });
  }

  return [...itemsByKind.values()].sort((left, right) => {
    const leftRank = GRAPH_LEGEND_RANK.get(left.kind) ?? GRAPH_LEGEND_RANK.size;
    const rightRank = GRAPH_LEGEND_RANK.get(right.kind) ?? GRAPH_LEGEND_RANK.size;
    return leftRank - rightRank || right.count - left.count || left.label.localeCompare(right.label);
  });
}

function graphLegendLabel(kind: string, node: GraphMapNode): string {
  return GRAPH_LEGEND_LABELS[kind] || node.typeLabel || titleCaseSlug(kind) || "Node";
}

function graphRelationshipModeFromSearchParam(input: string | null): GraphRelationshipMode | undefined {
  return input === "ai-reviewed" || input === "deterministic" ? input : undefined;
}

function graphRelationshipModeLabel(mode: GraphRelationshipMode): string {
  if (mode === "ai-reviewed") return "Saved relationships";
  return "Metadata links";
}

function semanticScopeKey(scope: any): string {
  const kind = String(scope?.kind || "all-docs");
  if (kind === "focused-graph-node") return `${kind}:${String(scope?.nodeId || "")}`;
  if (kind === "selected-docs") {
    const documentIds = Array.isArray(scope?.documentIds) ? scope.documentIds : [];
    return `${kind}:${documentIds.join(",")}`;
  }
  if (kind === "workstream") return `${kind}:${String(scope?.workstreamId || "")}`;
  if (kind === "repo") return `${kind}:${String(scope?.repoPath || "")}`;
  return kind;
}

function semanticScopeLabel(scope: any, focusLabel?: string): string {
  const kind = String(scope?.kind || "all-docs");
  if (kind === "focused-graph-node") return focusLabel ? `Focused: ${focusLabel}` : "Focused node";
  if (kind === "changed-docs") return "Changed docs";
  if (kind === "selected-docs") return "Selected docs";
  if (kind === "workstream") return "Workstream";
  if (kind === "repo") return "Repo";
  return "Project";
}

function semanticScopeSummary(scope: any, focusLabel?: string): { title: string; detail: string } {
  const kind = String(scope?.kind || "all-docs");
  if (kind === "focused-graph-node") {
    return {
      title: semanticScopeLabel(scope, focusLabel),
      detail: "Run review uses docs directly linked to this graph node."
    };
  }
  if (kind === "changed-docs") {
    return {
      title: "Changed docs",
      detail: "Run review skips docs that already have a current extraction cache."
    };
  }
  return {
    title: semanticScopeLabel(scope, focusLabel),
    detail: "Run review uses all eligible project docs and reuses cached extractions."
  };
}

function durableSemanticEdgeId(input?: string): string | undefined {
  if (!input || input.startsWith("proposal:")) return undefined;
  return input;
}

function proposedSemanticEdgeTarget(input?: string): { proposalId: string; edgeIndex: number } | undefined {
  if (!input?.startsWith("proposal:")) return undefined;
  const payload = input.slice("proposal:".length);
  const separatorIndex = payload.lastIndexOf(":");
  if (separatorIndex <= 0) return undefined;

  const proposalId = payload.slice(0, separatorIndex);
  const edgeIndex = Number(payload.slice(separatorIndex + 1));
  if (!proposalId || !Number.isInteger(edgeIndex) || edgeIndex < 0) return undefined;
  return { proposalId, edgeIndex };
}
