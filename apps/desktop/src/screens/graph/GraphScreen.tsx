import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useSearchParams } from "react-router-dom";
import { CircleHelp, FlaskConical, Play, RotateCcw, X } from "lucide-react";
import { useStore } from "../../stores/store-context.js";
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
import { buildGraphFlowElements, RawStorageAudit } from "./graph-flow.js";

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
  const graph = useMemo(() => enhanceGraphForDisplay(store.graph, store.docs), [store.graph, store.docs]);
  const [graphViewMode, setGraphViewMode] = useState<GraphViewMode>(initialGraphViewMode);
  const [focusedNodeId, setFocusedNodeId] = useState(initialGraphViewMode === "all" ? "" : searchParams.get("focus") || "");
  const [focusHistory, setFocusHistory] = useState<string[]>([]);
  const [editingDocId, setEditingDocId] = useState(searchParams.get("doc") || "");
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
  const graphProjectId = store.selectedProjectId || String(graph?.projectId || "project");
  const graphNodeIds = useMemo(() => new Set((Array.isArray(graph?.nodes) ? graph.nodes : []).map((node: any) => String(node.id || ""))), [graph]);
  const graphPositionKey = `${GRAPH_POSITION_STORAGE_PREFIX}:${graphProjectId}:${graphViewMode}:${focusedNodeId || "overview"}`;
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

  useEffect(() => {
    const nextGraphViewMode: GraphViewMode = searchParams.get("view") === "all" ? "all" : "context";
    const nextFocusedNodeId = nextGraphViewMode === "all" ? "" : searchParams.get("focus") || "";
    const nextEditingDocId = searchParams.get("doc") || "";

    setGraphViewMode((current) => current === nextGraphViewMode ? current : nextGraphViewMode);
    setFocusedNodeId((current) => current === nextFocusedNodeId ? current : nextFocusedNodeId);
    setEditingDocId((current) => current === nextEditingDocId ? current : nextEditingDocId);
  }, [searchParams]);

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
    setSemanticRunDraft((current) => ({
      ...current,
      model: current.model || store.semanticGraphSettings?.model || ""
    }));
  }, [store.selectedProjectId, store.semanticGraphSettings?.model]);

  useEffect(() => {
    if (!focusedNodeId && semanticRunDraft.scopeKind === "focused") {
      updateSemanticRunDraft({ scopeKind: "all-docs" });
    }
  }, [focusedNodeId, semanticRunDraft.scopeKind]);

  function updateGraphSearchParams(nextState: {
    viewMode?: GraphViewMode;
    focus?: string | null;
    doc?: string | null;
  }, replace = false) {
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);

      if (nextState.viewMode) {
        if (nextState.viewMode === "all") nextParams.set("view", "all");
        else nextParams.delete("view");
      }

      if (nextState.focus !== undefined) {
        if (nextState.focus) nextParams.set("focus", nextState.focus);
        else nextParams.delete("focus");
      }

      if (nextState.doc !== undefined) {
        if (nextState.doc) nextParams.set("doc", nextState.doc);
        else nextParams.delete("doc");
      }

      return nextParams;
    }, { replace });
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
    graphScreenDebugLog("navigate-focus:start", {
      nextNodeId,
      focusedNodeId,
      focusHistory
    });
    if (!nextNodeId) {
      graphScreenDebugLog("navigate-focus:reset-empty", {});
      resetGraphFocus();
      return;
    }

    setGraphViewMode("context");
    if (nextNodeId === focusedNodeId) {
      const previousFocusedNodeId = focusHistory[focusHistory.length - 1] || "";
      if (previousFocusedNodeId) {
        const nextHistory = focusHistory.slice(0, -1);
        graphScreenDebugLog("navigate-focus:back", {
          from: focusedNodeId,
          to: previousFocusedNodeId,
          nextHistory
        });
        setFocusedNodeId(previousFocusedNodeId);
        setFocusHistory(nextHistory);
        updateGraphSearchParams({ viewMode: "context", focus: previousFocusedNodeId });
        return;
      }

      graphScreenDebugLog("navigate-focus:reset-current", {
        nodeId: nextNodeId
      });
      resetGraphFocus();
      return;
    }

    const existingHistoryIndex = focusHistory.indexOf(nextNodeId);
    if (existingHistoryIndex !== -1) {
      graphScreenDebugLog("navigate-focus:history-jump", {
        nextNodeId,
        existingHistoryIndex,
        nextHistory: focusHistory.slice(0, existingHistoryIndex)
      });
      setFocusedNodeId(nextNodeId);
      setFocusHistory(focusHistory.slice(0, existingHistoryIndex));
      updateGraphSearchParams({ viewMode: "context", focus: nextNodeId });
      return;
    }

    graphScreenDebugLog("navigate-focus:forward", {
      from: focusedNodeId,
      to: nextNodeId,
      nextHistory: focusedNodeId ? [...focusHistory, focusedNodeId] : []
    });
    setFocusHistory(focusedNodeId ? [...focusHistory, focusedNodeId] : []);
    setFocusedNodeId(nextNodeId);
    updateGraphSearchParams({ viewMode: "context", focus: nextNodeId });
  }

  function openGraphDocument(documentId: string) {
    graphScreenDebugLog("open-document", {
      documentId,
      exists: store.docs.some((doc) => doc.id === documentId)
    });
    setEditingDocId(documentId);
    updateGraphSearchParams({ doc: documentId });
  }

  function closeGraphDocument() {
    graphScreenDebugLog("close-document", {
      documentId: editingDocId
    });
    setEditingDocId("");
    updateGraphSearchParams({ doc: null });
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
        <span>{graphHiddenCount} {isRawGraph ? "ownership links" : "hidden"}</span>
        {graphGeneratedLabel ? <span>{graphGeneratedLabel}</span> : null}
      </div>
      {showGraphHelp ? (
        <div className="notice graph-explainer compact">
          <strong>Context graph, not storage inventory</strong>
          <p>
            Context map keeps high-signal hubs visible first. Import audit shows the noisier storage inventory for checking imports and derived links.
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
                    <strong>Focused neighborhood:</strong> nearby relationships around {graphElements.focusLabel || "the selected node"}.
                  </>
                ) : (
                  <>
                    <strong>Context map:</strong> high-signal hubs first, with leaf docs hidden until a node is focused.
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
              {!isRawGraph ? (
                <div className="semantic-analysis-panel">
                  <div className="semantic-analysis-header">
                    <strong>Semantic analysis</strong>
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

function graphScreenDebugLog(eventName: string, details: Record<string, unknown>): void {
  console.log(`[graph-screen] ${eventName}`, details);
}

function numberOrUndefined(input: string): number | undefined {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
