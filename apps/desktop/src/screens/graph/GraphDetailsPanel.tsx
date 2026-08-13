import { Link } from "react-router-dom";
import { FlaskConical, Play, Settings2, X } from "lucide-react";
import { KeyValue } from "../../components/layout.js";
import { Modal } from "../../components/Modal.js";
import { SemanticRunForm } from "../../features/semantic-review/index.js";
import { semanticScopeLabel } from "../../features/graph/semantic/semantic-review-adapter.js";
import { formatConfidence } from "../../utils/format.js";
import { graphEdgeLabel } from "./graph-presentation.js";
import { graphNodeVisualStyle } from "./graph-map-style.js";
import type { GraphScreenController } from "./useGraphScreenController.js";

type DetailsController = GraphScreenController["details"];
type SemanticModel = DetailsController["model"]["semantic"];
type SemanticActions = DetailsController["actions"]["semantic"];

export function GraphDetailsPanel({ controller }: { controller: DetailsController }) {
  const { model, actions } = controller;

  return (
    <div className="graph-board-details">
      <button
        type="button"
        className={`graph-details-toggle ${model.open ? "selected" : ""}`}
        onClick={actions.toggle}
        aria-expanded={model.open}
        title={model.open
          ? "Hide the graph details and AI relationship review panel."
          : "Show graph details, relationship counts, and AI review controls."}
      >
        {model.open ? "Hide details" : "Details"}
      </button>
      {model.open ? (
        <div className="graph-details-popover">
          <GraphModeNote
            isRawGraph={model.isRawGraph}
            focusedNodeId={model.focusedNodeId}
            focusLabel={model.focusLabel}
          />
          {!model.isRawGraph && model.edgeTypes.length ? (
            <div className="graph-edge-summary" aria-label="Relationship summary">
              {model.edgeTypes.map((item) => (
                <span key={item.type}>{graphEdgeLabel(item.type)} {item.count}</span>
              ))}
            </div>
          ) : null}
          {!model.isRawGraph && model.legendItems.length ? (
            <div className="graph-legend" aria-label="Graph legend">
              {model.legendItems.map((item) => {
                const colors = graphNodeVisualStyle(item.kind);
                return (
                  <span key={item.kind}>
                    <i
                      className="graph-legend-dot"
                      style={{ background: colors.fill, borderColor: colors.accent }}
                      aria-hidden="true"
                    />
                    {item.label}
                    <small className="graph-legend-count">{item.count}</small>
                  </span>
                );
              })}
            </div>
          ) : null}
          {model.selectedEdge ? <GraphEdgeInspector controller={controller} /> : null}
          {!model.isRawGraph ? (
            <SemanticReviewPanel
              model={model.semantic}
              actions={actions.semantic}
              focusedNodeId={model.focusedNodeId}
              focusLabel={model.focusLabel}
            />
          ) : null}
          {model.semantic.showPreviewDialog ? (
            <SemanticPreviewDialog model={model.semantic} actions={actions.semantic} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GraphModeNote({
  isRawGraph,
  focusedNodeId,
  focusLabel
}: {
  isRawGraph: boolean;
  focusedNodeId: string;
  focusLabel?: string;
}) {
  return (
    <div className={`graph-mode-note ${isRawGraph ? "warning" : ""}`}>
      {isRawGraph ? (
        <><strong>Import audit:</strong> stored records, project ownership links, and derived context relationships.</>
      ) : focusedNodeId ? (
        <><strong>Focused neighborhood:</strong> nearby saved relationships around {focusLabel || "the selected node"}.</>
      ) : (
        <><strong>Context map:</strong> saved relationships only, with leaf docs hidden until a node is focused.</>
      )}
    </div>
  );
}

function GraphEdgeInspector({ controller }: { controller: DetailsController }) {
  const { model, actions } = controller;
  const edge = model.selectedEdge;
  if (!edge) return null;

  const review = model.semantic.selectedEdgeReview;
  return (
    <div className="graph-edge-inspector">
      <div className="graph-edge-inspector-header">
        <strong>Selected relationship</strong>
        <button
          type="button"
          className="icon-button icon-only"
          onClick={actions.clearSelectedEdge}
          title="Clear selected relationship"
          aria-label="Clear selected relationship"
        >
          <X size={14} />
        </button>
      </div>
      <div className="semantic-graph-mini-stats">
        <KeyValue label="From" value={model.selectedEdgeFromLabel} />
        <KeyValue label="To" value={model.selectedEdgeToLabel} />
        <KeyValue label="Type" value={graphEdgeLabel(edge.type)} />
        <KeyValue label="Source" value={edge.sourceKind?.includes("semantic") ? "Semantic" : "Deterministic"} />
        {edge.semanticStatus ? <KeyValue label="Status" value={edge.semanticStatus} /> : null}
        {typeof edge.confidence === "number" ? (
          <KeyValue label="Confidence" value={formatConfidence(edge.confidence)} />
        ) : null}
      </div>
      {edge.reason ? (
        <div className="graph-edge-reason">
          <span>Reason</span>
          <p>{edge.reason}</p>
        </div>
      ) : null}
      {edge.evidence?.length ? (
        <div className="graph-edge-evidence">
          <span>Evidence</span>
          {edge.evidence.slice(0, 3).map((item, index) => (
            <blockquote key={`${edge.id}-evidence-${index}`}>
              {item.quote || "Evidence recorded without quote"}
              {item.sourcePath || item.documentId ? (
                <cite>{[item.sourcePath, item.documentId].filter(Boolean).join(" / ")}</cite>
              ) : null}
            </blockquote>
          ))}
        </div>
      ) : null}
      {review.isSemantic && edge.semanticEdgeId ? (
        <div className="graph-edge-actions" aria-label="Selected semantic relationship actions">
          {review.canAccept ? (
            <button
              type="button"
              disabled={model.semantic.loading}
              onClick={() => void actions.semantic.acceptSelectedEdge()}
              title="Accept this suggested semantic relationship so it becomes a saved graph link."
            >
              Accept Edge
            </button>
          ) : null}
          {review.canHide ? (
            <button
              type="button"
              className="danger-button"
              disabled={model.semantic.loading}
              onClick={() => void actions.semantic.hideSelectedEdge()}
              title="Hide this semantic relationship by marking it rejected."
            >
              Hide Edge
            </button>
          ) : null}
          {review.proposalRoute ? (
            <Link
              className="button-link"
              to={review.proposalRoute}
              title="Open the Inbox proposal that contains this suggested relationship."
            >
              Open Inbox
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SemanticReviewPanel({
  model,
  actions,
  focusedNodeId,
  focusLabel
}: {
  model: SemanticModel;
  actions: SemanticActions;
  focusedNodeId: string;
  focusLabel?: string;
}) {
  return (
    <div className="semantic-analysis-panel">
      <div className="semantic-review-header">
        <strong>AI relationship review</strong>
        <div className="semantic-review-meta">
          <span>{model.latestRun.statusLabel}</span>
          {model.latestRun.startedLabel ? (
            <time dateTime={model.latestRun.started}>{model.latestRun.startedLabel}</time>
          ) : null}
        </div>
      </div>
      <div className="semantic-review-stats" aria-label="AI relationship review summary">
        <div className="semantic-review-stat">
          <span>Accepted</span>
          <strong>{(model.edgeCounts.accepted || 0) + (model.edgeCounts["auto-accepted"] || 0)}</strong>
        </div>
        <div className="semantic-review-stat">
          <span>Proposed</span>
          <strong>{model.edgeCounts.proposed || 0}</strong>
        </div>
      </div>
      <div className="semantic-provider-strip">
        <span>{model.provider.ready
          ? `${model.provider.model} at ${model.provider.endpoint}`
          : "Provider not configured"}</span>
        <Link
          className="button-link compact-link"
          to={model.provider.assistantRoute}
          title="Open Assistant settings to configure the provider and model used by AI relationship review."
        >
          Assistant
        </Link>
      </div>
      <div className="semantic-run-form semantic-run-form-basic">
        <label>
          <span>Review target</span>
          <select
            value={model.draft.scopeKind}
            disabled={model.loading}
            onChange={(event) => actions.patchDraft({ scopeKind: event.target.value })}
          >
            <option value="focused" disabled={!focusedNodeId}>Focused node</option>
            <option value="changed-docs">Changed docs</option>
            <option value="all-docs">Project</option>
          </select>
          <small>{model.scopeCopy.title}. {model.scopeCopy.detail}</small>
        </label>
      </div>
      <div className="semantic-run-actions primary">
        <button
          type="button"
          className="icon-text-button primary"
          disabled={!model.projectId || model.loading || !model.provider.ready}
          onClick={actions.runAnalysis}
          title="Run AI relationship review for the selected target. This calls the configured model and may create Inbox proposals."
        >
          <Play size={14} />
          Run review
        </button>
        <div className="semantic-run-secondary-actions">
          <button
            type="button"
            className="icon-text-button"
            disabled={!model.projectId || model.loading}
            onClick={actions.openPreviewDialog}
            title="Estimate how many docs and candidate relationships this target will process. This does not call the AI model or change the graph."
          >
            <FlaskConical size={14} />
            {model.previewState?.status === "loading" ? "Estimating..." : "Estimate docs"}
          </button>
          <button
            type="button"
            className={`icon-text-button ${model.showAdvanced ? "selected" : ""}`}
            disabled={model.loading}
            onClick={actions.toggleAdvanced}
            aria-expanded={model.showAdvanced}
            title="Show provider overrides, limits, timeouts, and JSON response settings for the next review run."
          >
            <Settings2 size={14} />
            Advanced
          </button>
        </div>
      </div>
      {model.showAdvanced ? (
        <div className="semantic-run-advanced">
          <SemanticRunForm
            draft={model.draft}
            disabled={model.loading}
            onPatch={actions.patchDraft}
            fields={[
              { key: "mode" },
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
      {model.previewState?.status === "loading" ? (
        <div className="semantic-run-preview pending" aria-live="polite">
          <strong>{model.scopeCopy.title}</strong>
          <span>Estimating eligible docs and candidate links...</span>
        </div>
      ) : model.previewState?.status === "failed" ? (
        <div className="semantic-run-preview failed" aria-live="polite">
          <strong>{model.scopeCopy.title}</strong>
          <span>{model.previewState.error || "Unable to estimate this target."}</span>
        </div>
      ) : model.preview ? (
        <div className="semantic-run-preview" aria-label="Review target preview">
          <strong>{model.scopeCopy.title}</strong>
          <span><b>{model.preview.counts?.documentsEligible ?? 0}</b> eligible</span>
          <span><b>{model.preview.counts?.baselineExtractions ?? 0}</b> new</span>
          <span><b>{model.preview.counts?.cachedExtractions ?? 0}</b> cached</span>
          <span><b>{model.preview.counts?.candidates ?? 0}</b> candidates</span>
        </div>
      ) : null}
      {model.result?.run ? (
        <div className="semantic-run-result">
          <div className="semantic-analysis-header">
            <strong>{model.result.run.status}</strong>
            <span>{model.result.run.mode}</span>
          </div>
          <div className="semantic-graph-mini-stats">
            <KeyValue label="Target" value={semanticScopeLabel(model.result.run.scope, focusLabel)} />
            <KeyValue label="Docs" value={`${model.result.run.counts?.documentsAnalyzed || 0} new / ${model.result.run.counts?.extractionsReused || 0} cached`} />
            <KeyValue label="Judged" value={model.result.run.counts?.judged || 0} />
            <KeyValue label="Accepted" value={model.result.run.counts?.accepted || 0} />
            <KeyValue label="Proposed" value={model.result.run.counts?.proposed || 0} />
            <KeyValue label="Discarded" value={model.result.run.counts?.discarded || 0} />
            <KeyValue label="Proposal" value={model.result.proposal?.id || "None"} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SemanticPreviewDialog({ model, actions }: { model: SemanticModel; actions: SemanticActions }) {
  return (
    <Modal
      ariaLabel="Estimate review target"
      backdropClassName="dialog-backdrop graph-confirm-backdrop"
      className="confirm-dialog graph-preview-dialog"
      onClose={actions.closePreviewDialog}
    >
      <h3>Estimate Review Target?</h3>
      <p>
        This checks <strong>{model.scopeCopy.title}</strong> and reports how many docs and candidate relationships would be included.
      </p>
      <p>
        It does not call the AI model, create Inbox proposals, accept links, or change the graph.
      </p>
      <div className="button-row">
        <button
          type="button"
          onClick={actions.closePreviewDialog}
          title="Close this dialog without estimating the target."
        >
          Cancel
        </button>
        <button
          type="button"
          className="icon-text-button primary"
          disabled={model.loading}
          onClick={() => {
            actions.closePreviewDialog();
            void actions.previewAnalysis();
          }}
          title="Start the estimate. This does not call the AI model or change graph relationships."
        >
          Start estimate
        </button>
      </div>
    </Modal>
  );
}
