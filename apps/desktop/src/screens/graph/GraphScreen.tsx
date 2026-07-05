import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useSearchParams } from "react-router-dom";
import { CircleHelp, FlaskConical, Play, RotateCcw, X } from "lucide-react";
import { useStore } from "../../stores/store-context.js";
import type { GraphRelationshipMode } from "../../stores/root-store.js";
import { KeyValue, Screen } from "../../components/layout.js";
import { LibraryTabs } from "../../components/SectionTabs.js";
import { DocumentEditorModal } from "../../components/DocumentEditorModal.js";
import { formatShortDateTime } from "../../utils/format.js";
import {
  type GraphViewMode,
  enhanceGraphForDisplay,
  getGraphFocusOptions,
  getGraphStats,
  graphEdgeLabel,
} from "./graph-display.js";
import { GraphMap, graphNodeVisualStyle, removeStoredGraphNodePositions } from "./GraphMap.js";
import { buildGraphFlowElements, type GraphMapEdge, RawStorageAudit } from "./graph-flow.js";

const GRAPH_POSITION_STORAGE_PREFIX = "aimem.graph.positions.d3.v2";
const GRAPH_LEGEND_ITEMS = [
  ["project", "Project"],
  ["repo", "Repo"],
  ["workstream", "Workstream"],
  ["service", "Service"],
  ["package", "Package"],
  ["topic", "Topic"],
  ["diagram-group", "Diagram group"],
  ["doc", "Document"],
  ["diagram", "Diagram"],
  ["decision", "Decision"],
  ["command", "Command"],
  ["gotcha", "Gotcha"],
  ["session", "Session"],
  ["task", "Task"],
  ["file", "File"],
  ["external-reference", "External"]
] as const;

export const GraphScreen = observer(function GraphScreen() {
  const store = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialGraphViewMode = searchParams.get("view") === "all" ? "all" : "context";
  const initialRelationshipMode = graphRelationshipModeFromSearchParam(searchParams.get("relationships")) || "deterministic";
  const graph = useMemo(() => enhanceGraphForDisplay(store.graph, store.docs), [store.graph, store.docs]);
  const [graphViewMode, setGraphViewMode] = useState<GraphViewMode>(initialGraphViewMode);
  const [focusedNodeId, setFocusedNodeId] = useState(initialGraphViewMode === "all" ? "" : searchParams.get("focus") || "");
  const [focusHistory, setFocusHistory] = useState<string[]>([]);
  const [editingDocId, setEditingDocId] = useState(searchParams.get("doc") || "");
  const [selectedGraphEdgeId, setSelectedGraphEdgeId] = useState(searchParams.get("edge") || "");
  const [showGraphHelp, setShowGraphHelp] = useState(false);
  const [showGraphDetails, setShowGraphDetails] = useState(false);
  const [semanticRunDraft, setSemanticRunDraft] = useState({
    mode: "dry-run",
    scopeKind: "focused",
    endpoint: "",
    model: "",
    apiKey: "",
    maxDocuments: "8",
    maxCandidates: "24",
    maxCandidatesPerDocument: "8"
  });
  const [layoutVersion, setLayoutVersion] = useState(0);
  const graphStats = useMemo(() => getGraphStats(graph), [graph]);
  const focusOptions = useMemo(() => getGraphFocusOptions(graph), [graph]);
  const graphElements = useMemo(() => buildGraphFlowElements(graph, graphViewMode, focusedNodeId), [graph, graphViewMode, focusedNodeId]);
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
  const graphProjectId = store.selectedProjectId || String(graph?.projectId || "project");
  const graphNodeIds = useMemo(() => new Set((Array.isArray(graph?.nodes) ? graph.nodes : []).map((node: any) => String(node.id || ""))), [graph]);
  const graphRelationshipMode = store.graphRelationshipMode;
  const graphRelationshipLabel = graphRelationshipModeLabel(graphRelationshipMode);
  const graphPositionKey = `${GRAPH_POSITION_STORAGE_PREFIX}:${graphProjectId}:${graphViewMode}:${graphRelationshipMode}:${focusedNodeId || "overview"}`;
  const isRawGraph = graphViewMode === "all";
  const editingDoc = store.docs.find((doc) => doc.id === editingDocId);
  const graphScopeLabel = isRawGraph ? "Import audit" : focusedNodeId ? `Focused: ${graphElements.focusLabel || "selected node"}` : "Context map";
  const graphNodeCount = isRawGraph ? graphStats.nodes : graphElements.nodes.length;
  const graphLinkCount = isRawGraph ? graphStats.relationships : graphElements.edges.length;
  const graphHiddenCount = isRawGraph ? graphStats.memberships : graphElements.hiddenMemberships + graphElements.hiddenLeafNodes;
  const graphGeneratedLabel = graph?.generated ? `${graph.displayProjected ? "Projected" : "Generated"} ${formatShortDateTime(graph.generated)}` : "";
  const semanticEdgeCounts = store.semanticGraphEdgeCounts;
  const semanticLatestRun = store.semanticGraphStatus?.runCounts?.latest;
  const semanticResult = store.semanticAnalysisResult;
  const assistantPolicy = store.summary?.project?.assistantPolicy || store.selectedProject?.assistantPolicy || {};

  useEffect(() => {
    const nextGraphViewMode: GraphViewMode = searchParams.get("view") === "all" ? "all" : "context";
    const nextGraphRelationshipMode = graphRelationshipModeFromSearchParam(searchParams.get("relationships")) || "deterministic";
    const nextFocusedNodeId = nextGraphViewMode === "all" ? "" : searchParams.get("focus") || "";
    const nextEditingDocId = searchParams.get("doc") || "";
    const nextSelectedGraphEdgeId = searchParams.get("edge") || "";

    if (nextGraphRelationshipMode !== store.graphRelationshipMode) {
      void store.setGraphRelationshipMode(nextGraphRelationshipMode);
    }
    setGraphViewMode((current) => current === nextGraphViewMode ? current : nextGraphViewMode);
    setFocusedNodeId((current) => current === nextFocusedNodeId ? current : nextFocusedNodeId);
    setEditingDocId((current) => current === nextEditingDocId ? current : nextEditingDocId);
    setSelectedGraphEdgeId((current) => current === nextSelectedGraphEdgeId ? current : nextSelectedGraphEdgeId);
  }, [searchParams]);

  useEffect(() => {
    if (initialRelationshipMode !== store.graphRelationshipMode) {
      void store.setGraphRelationshipMode(initialRelationshipMode);
    }
  }, []);

  useEffect(() => {
    if (focusedNodeId && graphNodeIds.size > 0 && !graphNodeIds.has(focusedNodeId)) {
      setFocusedNodeId("");
      setFocusHistory([]);
      updateGraphSearchParams({ focus: null }, true);
    }
  }, [focusedNodeId, graphNodeIds]);

  useEffect(() => {
    if (editingDocId && store.docs.length > 0 && !store.docs.some((doc) => doc.id === editingDocId)) {
      setEditingDocId("");
      updateGraphSearchParams({ doc: null }, true);
    }
  }, [editingDocId, store.docs]);

  useEffect(() => {
    if (selectedGraphEdgeId && graphElementEdgeIds.size > 0 && !graphElementEdgeIds.has(selectedGraphEdgeId)) {
      setSelectedGraphEdgeId("");
      updateGraphSearchParams({ edge: null }, true);
    }
  }, [selectedGraphEdgeId, graphElementEdgeIds]);

  useEffect(() => {
    setSemanticRunDraft((current) => ({
      ...current,
      endpoint: current.endpoint || assistantPolicy.endpoint || "",
      model: current.model || store.semanticGraphSettings?.model || assistantPolicy.modelName || ""
    }));
  }, [store.selectedProjectId, store.semanticGraphSettings?.model, assistantPolicy.endpoint, assistantPolicy.modelName]);

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
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);

      if (nextState.viewMode) {
        if (nextState.viewMode === "all") nextParams.set("view", "all");
        else nextParams.delete("view");
      }

      if (nextState.relationshipMode) {
        if (nextState.relationshipMode === "deterministic") nextParams.delete("relationships");
        else nextParams.set("relationships", nextState.relationshipMode);
      }

      if (nextState.focus !== undefined) {
        if (nextState.focus) nextParams.set("focus", nextState.focus);
        else nextParams.delete("focus");
      }

      if (nextState.doc !== undefined) {
        if (nextState.doc) nextParams.set("doc", nextState.doc);
        else nextParams.delete("doc");
      }

      if (nextState.edge !== undefined) {
        if (nextState.edge) nextParams.set("edge", nextState.edge);
        else nextParams.delete("edge");
      }

      return nextParams;
    }, { replace });
  }

  function setGraphRelationshipMode(nextMode: GraphRelationshipMode) {
    void store.setGraphRelationshipMode(nextMode);
    updateGraphSearchParams({ relationshipMode: nextMode });
  }

  function resetGraphFocus() {
    setFocusedNodeId("");
    setFocusHistory([]);
    updateGraphSearchParams({ viewMode: "context", focus: null });
  }

  function setGraphFocusFromControl(nextNodeId: string) {
    setGraphViewMode("context");
    setFocusedNodeId(nextNodeId);
    setFocusHistory([]);
    updateGraphSearchParams({ viewMode: "context", focus: nextNodeId || null });
  }

  function navigateGraphFocus(nextNodeId: string) {
    if (!nextNodeId) {
      resetGraphFocus();
      return;
    }

    setGraphViewMode("context");
    if (nextNodeId === focusedNodeId) {
      const previousFocusedNodeId = focusHistory[focusHistory.length - 1] || "";
      if (previousFocusedNodeId) {
        const nextHistory = focusHistory.slice(0, -1);
        setFocusedNodeId(previousFocusedNodeId);
        setFocusHistory(nextHistory);
        updateGraphSearchParams({ viewMode: "context", focus: previousFocusedNodeId });
        return;
      }

      resetGraphFocus();
      return;
    }

    const existingHistoryIndex = focusHistory.indexOf(nextNodeId);
    if (existingHistoryIndex !== -1) {
      setFocusedNodeId(nextNodeId);
      setFocusHistory(focusHistory.slice(0, existingHistoryIndex));
      updateGraphSearchParams({ viewMode: "context", focus: nextNodeId });
      return;
    }

    setFocusHistory(focusedNodeId ? [...focusHistory, focusedNodeId] : []);
    setFocusedNodeId(nextNodeId);
    updateGraphSearchParams({ viewMode: "context", focus: nextNodeId });
  }

  function openGraphDocument(documentId: string) {
    setEditingDocId(documentId);
    updateGraphSearchParams({ doc: documentId });
  }

  function closeGraphDocument() {
    setEditingDocId("");
    updateGraphSearchParams({ doc: null });
  }

  function selectGraphEdge(edge: GraphMapEdge) {
    setSelectedGraphEdgeId(edge.id);
    setShowGraphDetails(true);
    updateGraphSearchParams({ edge: edge.id });
  }

  function clearSelectedGraphEdge() {
    setSelectedGraphEdgeId("");
    updateGraphSearchParams({ edge: null });
  }

  const resetGraphLayout = useCallback(() => {
    removeStoredGraphNodePositions(graphPositionKey);
    setLayoutVersion((currentVersion) => currentVersion + 1);
  }, [graphPositionKey]);

  function updateSemanticRunDraft(patch: Partial<typeof semanticRunDraft>) {
    setSemanticRunDraft((current) => ({ ...current, ...patch }));
  }

  function semanticAnalysisScope() {
    if (semanticRunDraft.scopeKind === "changed-docs") return { kind: "changed-docs" };
    if (semanticRunDraft.scopeKind === "focused" && focusedNodeId && !isRawGraph) {
      return { kind: "focused-graph-node", nodeId: focusedNodeId };
    }
    return { kind: "all-docs" };
  }

  function previewSemanticAnalysis() {
    void store.previewSemanticGraphAnalysis(semanticAnalysisScope());
  }

  function runSemanticAnalysis() {
    const mode = semanticRunDraft.mode || "dry-run";
    void store.analyzeSemanticGraph({
      mode,
      dryRun: mode === "dry-run",
      scope: semanticAnalysisScope(),
      endpoint: semanticRunDraft.endpoint.trim() || undefined,
      model: semanticRunDraft.model.trim() || undefined,
      apiKey: semanticRunDraft.apiKey.trim() || undefined,
      maxDocuments: numberOrUndefined(semanticRunDraft.maxDocuments),
      maxCandidates: numberOrUndefined(semanticRunDraft.maxCandidates),
      maxCandidatesPerDocument: numberOrUndefined(semanticRunDraft.maxCandidatesPerDocument)
    });
  }

  async function acceptSelectedSemanticEdge() {
    if (selectedProposedSemanticEdge) {
      await store.acceptSemanticEdgesProposal(selectedProposedSemanticEdge.proposalId, {
        edgeIndexes: [selectedProposedSemanticEdge.edgeIndex]
      });
      clearSelectedGraphEdge();
      return;
    }

    if (selectedDurableSemanticEdgeId) {
      await store.updateSemanticEdgeStatus([selectedDurableSemanticEdgeId], "accepted");
      clearSelectedGraphEdge();
    }
  }

  async function hideSelectedSemanticEdge() {
    if (!selectedDurableSemanticEdgeId) return;
    await store.updateSemanticEdgeStatus([selectedDurableSemanticEdgeId], "rejected");
    clearSelectedGraphEdge();
  }

  return (
    <Screen title="Graph">
      <LibraryTabs />
      <div className="graph-view-toolbar">
        <div className="segmented-control compact graph-mode-control" role="group" aria-label="Graph view">
          <button
            type="button"
            className={graphViewMode === "context" ? "selected" : ""}
            onClick={() => {
              setGraphViewMode("context");
              updateGraphSearchParams({ viewMode: "context" });
            }}
          >
            Context map
          </button>
          <button
            type="button"
            className={graphViewMode === "all" ? "selected" : ""}
            onClick={() => {
              setGraphViewMode("all");
              setFocusedNodeId("");
              setFocusHistory([]);
              updateGraphSearchParams({ viewMode: "all", focus: null });
            }}
          >
            Import audit
          </button>
        </div>
        <div className="segmented-control compact graph-relationship-control" role="group" aria-label="Relationship mode">
          <button
            type="button"
            className={graphRelationshipMode === "deterministic" ? "selected" : ""}
            onClick={() => setGraphRelationshipMode("deterministic")}
          >
            Basic
          </button>
          <button
            type="button"
            className={graphRelationshipMode === "ai-reviewed" ? "selected" : ""}
            onClick={() => setGraphRelationshipMode("ai-reviewed")}
          >
            AI reviewed
          </button>
          <button
            type="button"
            className={graphRelationshipMode === "ai-review" ? "selected" : ""}
            onClick={() => setGraphRelationshipMode("ai-review")}
          >
            AI review
          </button>
        </div>
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
            Context map keeps high-signal hubs visible first. Basic uses deterministic naming and import signals; AI reviewed overlays accepted model relationships; AI review also shows proposed edges.
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
                    <strong>Focused neighborhood:</strong> nearby {graphRelationshipLabel.toLowerCase()} relationships around {graphElements.focusLabel || "the selected node"}.
                  </>
                ) : (
                  <>
                    <strong>Context map:</strong> high-signal hubs first, with {graphRelationshipLabel.toLowerCase()} relationships and leaf docs hidden until a node is focused.
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
              {!isRawGraph ? (
                <div className="graph-legend" aria-label="Graph legend">
                  {GRAPH_LEGEND_ITEMS.map(([kind, label]) => {
                    const colors = graphNodeVisualStyle(kind);
                    return (
                    <span key={kind}>
                      <i
                        className="graph-legend-dot"
                        style={{
                          background: colors.fill,
                          borderColor: colors.accent
                        }}
                        aria-hidden="true"
                      />
                      {label}
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
                      <KeyValue label="Confidence" value={`${Math.round(selectedGraphEdge.confidence * 100)}%`} />
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
                          disabled={store.loading}
                          onClick={() => void acceptSelectedSemanticEdge()}
                        >
                          Accept Edge
                        </button>
                      ) : null}
                      {canHideSelectedSemanticEdge ? (
                        <button
                          type="button"
                          className="danger-button"
                          disabled={store.loading}
                          onClick={() => void hideSelectedSemanticEdge()}
                        >
                          Hide Edge
                        </button>
                      ) : null}
                      {selectedProposedSemanticEdge ? (
                        <Link
                          className="button-link"
                          to={`/inbox?proposal=${encodeURIComponent(selectedProposedSemanticEdge.proposalId)}`}
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
                  <div className="semantic-analysis-header">
                    <strong>Advanced AI analysis</strong>
                    <span>{semanticLatestRun?.status || "No runs"}</span>
                  </div>
                  <div className="semantic-graph-mini-stats">
                    <KeyValue label="Accepted" value={(semanticEdgeCounts.accepted || 0) + (semanticEdgeCounts["auto-accepted"] || 0)} />
                    <KeyValue label="Proposed" value={semanticEdgeCounts.proposed || 0} />
                    <KeyValue label="Latest" value={semanticLatestRun?.started ? formatShortDateTime(semanticLatestRun.started) : "None"} />
                  </div>
                  <div className="semantic-run-form">
                    <label>
                      <span>Mode</span>
                      <select
                        value={semanticRunDraft.mode}
                        disabled={store.loading}
                        onChange={(event) => updateSemanticRunDraft({ mode: event.target.value })}
                      >
                        <option value="dry-run">Dry run</option>
                        <option value="review">Review</option>
                        <option value="auto">Auto</option>
                      </select>
                    </label>
                    <label>
                      <span>Scope</span>
                      <select
                        value={semanticRunDraft.scopeKind}
                        disabled={store.loading}
                        onChange={(event) => updateSemanticRunDraft({ scopeKind: event.target.value })}
                      >
                        <option value="focused" disabled={!focusedNodeId || isRawGraph}>Focused node</option>
                        <option value="changed-docs">Changed docs</option>
                        <option value="all-docs">Project</option>
                      </select>
                    </label>
                    <label>
                      <span>Endpoint</span>
                      <input
                        value={semanticRunDraft.endpoint}
                        disabled={store.loading}
                        onChange={(event) => updateSemanticRunDraft({ endpoint: event.target.value })}
                        placeholder="http://127.0.0.1:8080/v1"
                      />
                    </label>
                    <label>
                      <span>Model</span>
                      <input
                        value={semanticRunDraft.model}
                        disabled={store.loading}
                        onChange={(event) => updateSemanticRunDraft({ model: event.target.value })}
                        placeholder="local model"
                      />
                    </label>
                    <label>
                      <span>API key</span>
                      <input
                        type="password"
                        value={semanticRunDraft.apiKey}
                        disabled={store.loading}
                        onChange={(event) => updateSemanticRunDraft({ apiKey: event.target.value })}
                        placeholder="optional"
                      />
                    </label>
                    <label>
                      <span>Max docs</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={semanticRunDraft.maxDocuments}
                        disabled={store.loading}
                        onChange={(event) => updateSemanticRunDraft({ maxDocuments: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Max candidates</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={semanticRunDraft.maxCandidates}
                        disabled={store.loading}
                        onChange={(event) => updateSemanticRunDraft({ maxCandidates: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Per doc</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={semanticRunDraft.maxCandidatesPerDocument}
                        disabled={store.loading}
                        onChange={(event) => updateSemanticRunDraft({ maxCandidatesPerDocument: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="semantic-run-actions">
                    <button
                      type="button"
                      className="icon-text-button"
                      disabled={!store.selectedProjectId || store.loading}
                      onClick={previewSemanticAnalysis}
                    >
                      <FlaskConical size={14} />
                      Preview
                    </button>
                    <button
                      type="button"
                      className="icon-text-button"
                      disabled={!store.selectedProjectId || store.loading}
                      onClick={runSemanticAnalysis}
                    >
                      <Play size={14} />
                      Run
                    </button>
                  </div>
                  {semanticResult?.run ? (
                    <div className="semantic-run-result">
                      <div className="semantic-analysis-header">
                        <strong>{semanticResult.run.status}</strong>
                        <span>{semanticResult.run.mode}</span>
                      </div>
                      <div className="semantic-graph-mini-stats">
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
            </div>
          ) : null}
        </div>
        {isRawGraph ? (
          <RawStorageAudit graph={graph} />
        ) : graphElements.nodes.length ? (
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
        ) : (
          <div className="graph-empty-state">
            <strong>No useful links yet</strong>
            <p>
              This project currently has only storage membership links or no focusable hubs.
              Import paths, topics, workstreams, sessions, files, and reviewed AI proposals can create context graph links.
            </p>
            <button type="button" onClick={() => setGraphViewMode("all")}>Show import audit</button>
          </div>
        )}
      </div>
      {editingDoc ? (
        <DocumentEditorModal
          doc={editingDoc}
          saving={store.loading}
          onClose={closeGraphDocument}
          onSave={(changes) => store.updateDocument(editingDoc.id, changes)}
          onDelete={async () => {
            await store.deleteDocument(editingDoc.id);
            closeGraphDocument();
          }}
        />
      ) : null}
    </Screen>
  );
});

function numberOrUndefined(input: string): number | undefined {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function graphRelationshipModeFromSearchParam(input: string | null): GraphRelationshipMode | undefined {
  return input === "ai-reviewed" || input === "ai-review" || input === "deterministic" ? input : undefined;
}

function graphRelationshipModeLabel(mode: GraphRelationshipMode): string {
  if (mode === "ai-review") return "AI review links";
  if (mode === "ai-reviewed") return "AI reviewed links";
  return "Basic links";
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
