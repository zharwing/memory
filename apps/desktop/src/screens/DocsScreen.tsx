import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import { Activity, AlertCircle, CircleHelp, Play, Settings2, Sparkles, X } from "lucide-react";
import type { AssistantPolicy } from "@zharwing/memory-core";
import { useStore } from "../stores/store-context.js";
import { Empty, Screen } from "../components/layout.js";
import { LibraryTabs } from "../components/SectionTabs.js";
import { DataTable } from "../components/DataTable.js";
import { DocumentEditorHost } from "../components/DocumentEditorHost.js";
import { Modal } from "../components/Modal.js";
import { ToggleGroup } from "../components/ToggleGroup.js";
import { useCloseWhenMissing, useSearchParamState } from "../hooks/useSearchParamState.js";
import {
  SemanticRunField,
  SemanticRunForm,
  SemanticRunProgress,
  semanticRunStatus,
  useSemanticRunDraft
} from "../features/semantic-review/index.js";
import { filterDocuments, isStarterDraftDoc } from "../utils/documents.js";
import { providerLabel } from "../utils/labels.js";
import { projectPath } from "../utils/routes.js";
import { semanticEdgesFromProposalPatch } from "@zharwing/memory-semantic-graph/proposals";
import { pendingInboxItems } from "../utils/inbox.js";

export const DocsScreen = observer(function DocsScreen() {
  const store = useStore();
  const [editingDocId, setDocSearchParam] = useSearchParamState("doc");
  const selectedDocId = editingDocId;
  const [filter, setFilter] = useState("all");
  const [showStarterDocsHelp, setShowStarterDocsHelp] = useState(false);
  const [showLinkDiscoveryDialog, setShowLinkDiscoveryDialog] = useState(false);
  const [showRelationshipAdvanced, setShowRelationshipAdvanced] = useState(false);
  const {
    draft: relationshipRunDraft,
    patchDraft: updateRelationshipRunDraft,
    resetDraft: resetRelationshipRunDraft,
    toPayload: relationshipRunPayload
  } = useSemanticRunDraft();
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const docs = store.docs.filter((doc) => doc.type !== "diagram");
  // Mirrors the daemon-side semantic analysis eligibility: only ai-eligible
  // and ai-pinned documents are ever sent to the provider.
  const aiEligibleDocs = docs.filter((doc) => doc.visibility === "ai-eligible" || doc.visibility === "ai-pinned");
  const filteredDocs = filterDocuments(docs, filter);
  const starterDraftDocs = store.docs.filter(isStarterDraftDoc);
  const pageCount = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  const pageIndex = Math.min(page, pageCount - 1);
  const pagedDocs = filteredDocs.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const editingDoc = store.docs.find((doc) => doc.id === editingDocId);
  const pendingRelationshipApprovals = pendingInboxItems(store.inbox).filter((item) =>
    item.type === "graph-update" &&
    semanticEdgesFromProposalPatch(item.proposedPatch)?.edges.length
  );
  const pendingRelationshipCount = pendingRelationshipApprovals.length;
  const pendingRelationshipSuggestions = pendingRelationshipApprovals.reduce((total, item) => {
    return total + (semanticEdgesFromProposalPatch(item.proposedPatch)?.edges.length || 0);
  }, 0);
  const assistantPolicy: Partial<AssistantPolicy> = store.summary?.project?.assistantPolicy || store.selectedProject?.assistantPolicy || {};
  const assistantRuntimeType = String(assistantPolicy.runtimeType || "disabled");
  const relationshipProviderEndpoint = assistantPolicy.endpoint || "";
  const relationshipProviderModel = store.semanticGraphSettings?.model || assistantPolicy.modelName || "";
  const relationshipProviderName = providerLabel(assistantRuntimeType);
  const relationshipProviderModelDisplayName = modelDisplayNameForLinkDiscovery({
    assistantPolicy,
    providerCheck: store.assistantProviderCheck,
    modelId: relationshipProviderModel
  });
  const relationshipProviderConnected = Boolean(store.assistantProviderCheck?.ok);
  const relationshipProviderReady = Boolean(
    assistantPolicy.enabled &&
    assistantRuntimeType !== "disabled" &&
    relationshipProviderEndpoint &&
    relationshipProviderModel
  );
  const semanticEdgeCounts = store.semanticGraphEdgeCounts;
  const semanticLatestRun = store.semanticGraphStatus?.runCounts?.latest;
  const semanticResult = store.semanticAnalysisResult;
  const savedLinkCount = (semanticEdgeCounts.accepted || 0) + (semanticEdgeCounts["auto-accepted"] || 0);
  const semanticDisplayRun = store.semanticAnalysisProgressRun || semanticResult?.run || semanticLatestRun;
  const semanticRunCounts = semanticDisplayRun?.counts || {};
  const runProgress = semanticRunStatus(semanticDisplayRun, store.semanticAnalysisRunning);
  const semanticRunRunning = runProgress.running;
  const semanticRunFinished = runProgress.finished;
  const semanticProposalId = semanticResult?.proposal?.id || pendingRelationshipApprovals[0]?.id;
  const semanticInboxPath = semanticProposalId
    ? projectPath(store.selectedProjectId, `/inbox?proposal=${encodeURIComponent(semanticProposalId)}`)
    : projectPath(store.selectedProjectId, "/inbox");
  const showSemanticRunBanner = Boolean(semanticDisplayRun && !showLinkDiscoveryDialog && (semanticRunRunning || semanticRunFinished));

  useCloseWhenMissing(
    editingDocId,
    store.docs.length > 0 && !store.docs.some((doc) => doc.id === editingDocId),
    () => closeDocEditor(true)
  );

  function chooseFilter(nextFilter: string) {
    setFilter(nextFilter);
    setShowStarterDocsHelp(false);
    setPage(0);
  }

  function openDocEditor(doc: any) {
    setDocSearchParam(doc.id);
  }

  function closeDocEditor(replace = false) {
    setDocSearchParam(null, { replace });
  }

  function openLinkDiscoveryDialog() {
    setShowRelationshipAdvanced(false);
    resetRelationshipRunDraft();
    setShowLinkDiscoveryDialog(true);
  }

  function closeLinkDiscoveryDialog() {
    setShowRelationshipAdvanced(false);
    resetRelationshipRunDraft();
    setShowLinkDiscoveryDialog(false);
  }

  function runRelationshipReview() {
    void store.analyzeSemanticGraph(relationshipRunPayload({
      scope: { kind: "all-docs" },
      fallbackMode: "review"
    }));
  }

  function paginationControls(position: "top" | "bottom") {
    return (
      <div className={`pagination-controls ${position === "bottom" ? "bottom-pagination" : ""}`}>
        <span>{filteredDocs.length ? `${pageIndex * pageSize + 1}-${Math.min((pageIndex + 1) * pageSize, filteredDocs.length)} of ${filteredDocs.length}` : "0 documents"}</span>
        <button type="button" disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>Previous</button>
        <button type="button" disabled={pageIndex >= pageCount - 1} onClick={() => setPage(pageIndex + 1)}>Next</button>
      </div>
    );
  }

  return (
    <Screen title="Docs Library">
      <LibraryTabs />
      {showSemanticRunBanner ? (
        <section className={`semantic-run-banner ${semanticRunStatusClass(semanticDisplayRun)}`} aria-live={semanticRunRunning ? "polite" : "off"}>
          <div className="semantic-run-banner-main">
            <div className="semantic-run-banner-title">
              <Activity size={16} aria-hidden="true" />
              <div>
                <strong>{semanticRunTitle(semanticDisplayRun, pendingRelationshipSuggestions, Boolean(semanticResult?.proposal))}</strong>
                <span>{semanticRunPhase(semanticDisplayRun, semanticRunRunning)}</span>
              </div>
            </div>
            {semanticRunRunning ? (
              <SemanticRunProgress
                className="semantic-run-banner-progress"
                documentsProcessed={runProgress.documentsProcessed}
                documentsTotal={runProgress.documentsTotal}
                candidatesJudged={runProgress.candidatesJudged}
                candidatesTotal={runProgress.candidatesTotal}
              />
            ) : (
              <p className="semantic-run-banner-copy">
                {semanticRunCompletionCopy(semanticDisplayRun, pendingRelationshipSuggestions, Boolean(semanticResult?.proposal))}
              </p>
            )}
          </div>
          <div className="semantic-run-banner-actions">
            <button
              type="button"
              className="icon-text-button"
              onClick={() => setShowLinkDiscoveryDialog(true)}
            >
              <Sparkles size={14} aria-hidden="true" />
              {semanticRunRunning ? "View progress" : "View details"}
            </button>
            {semanticRunFinished && (pendingRelationshipSuggestions > 0 || semanticResult?.proposal) ? (
              <Link className="button-link primary" to={semanticInboxPath}>
                Review Inbox
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
      {(filter === "draft" || showStarterDocsHelp) ? (
        <div className="notice docs-explainer">
          <strong>Draft starter docs</strong>
          <p>
            These default project documents are reusable memory for agents: overview, architecture,
            decisions, tasks, gotchas, commands, glossary, and privacy rules. They start as drafts
            because they are placeholders until you or an agent fills them with project-specific facts.
          </p>
          <p>
            Sessions are chronological work logs for a run. Docs are longer-lived project knowledge
            that future sessions can reuse without digging through every past log.
          </p>
        </div>
      ) : null}
      <div className="table-toolbar">
        <div className="docs-filter-row">
          <ToggleGroup
            className="option-chips"
            ariaLabel="Document filters"
            value={filter}
            onChange={chooseFilter}
            options={[
              { value: "all", label: `All (${docs.length})` },
              { value: "imported", label: `Imported (${filterDocuments(docs, "imported").length})` },
              { value: "draft", label: `Draft (${filterDocuments(docs, "draft").length})` }
            ]}
          />
          {starterDraftDocs.length > 0 && filter !== "draft" ? (
            <button
              type="button"
              className={`icon-button icon-only docs-help-trigger ${showStarterDocsHelp ? "selected" : ""}`}
              onClick={() => setShowStarterDocsHelp((open) => !open)}
              title="What are draft starter docs?"
              aria-label="What are draft starter docs?"
              aria-expanded={showStarterDocsHelp}
            >
              <CircleHelp size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="docs-library-toolbar-actions">
          <button
            type="button"
            className="icon-text-button"
            onClick={openLinkDiscoveryDialog}
          >
            <Sparkles size={14} />
            Suggest graph links
            {pendingRelationshipSuggestions > 0 ? <small>{pendingRelationshipSuggestions} pending</small> : null}
          </button>
          {paginationControls("top")}
        </div>
      </div>
      {pagedDocs.length ? (
        <>
          <DataTable
            columns={["updated", "status", "visibility", "type", "title"]}
            rows={pagedDocs}
            selectedRowId={selectedDocId}
            onRowClick={openDocEditor}
            rowActions={(doc) => (
              <button type="button" onClick={() => openDocEditor(doc)}>
                Edit
              </button>
            )}
          />
          {paginationControls("bottom")}
        </>
      ) : (
        <Empty text="No documents match this filter." />
      )}
      {editingDoc ? (
        <DocumentEditorHost
          doc={editingDoc}
          onClose={() => closeDocEditor()}
          onDeleted={() => closeDocEditor(true)}
        />
      ) : null}
      {showLinkDiscoveryDialog ? (
        <Modal
          ariaLabel="Suggest graph links"
          backdropClassName="dialog-backdrop link-discovery-backdrop"
          className="link-discovery-dialog"
          onClose={closeLinkDiscoveryDialog}
        >
            <header className="link-discovery-header">
              <div>
                <span className="section-kicker">Graph link suggestions</span>
                <h3>Suggest graph links</h3>
              </div>
              <button
                type="button"
                className="icon-button icon-only"
                onClick={closeLinkDiscoveryDialog}
                title="Close"
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <p className="link-discovery-copy">
              AI will scan eligible documents and create link suggestions for review. Approved suggestions appear in Graph.
            </p>
            <div className="link-discovery-metrics" aria-label="Link discovery metrics">
              <span><strong>{aiEligibleDocs.length}</strong> eligible docs</span>
              <span><strong>{pendingRelationshipSuggestions}</strong> in Inbox</span>
              <span><strong>{savedLinkCount}</strong> approved links</span>
            </div>
            {!relationshipProviderReady ? (
              <div className="link-discovery-provider-required">
                <AlertCircle size={18} aria-hidden="true" />
                <div>
                  <strong>AI provider not connected</strong>
                  <p>Connect an AI provider before creating graph-link suggestions.</p>
                </div>
                <Link className="button-link primary" to={projectPath(store.selectedProjectId, "/assistant")}>
                  Open AI Assistant settings
                </Link>
              </div>
            ) : (
              <>
                <div className="link-discovery-provider-ready">
                  <span>Using {relationshipProviderName}</span>
                  <strong>{relationshipProviderConnected ? "Connected" : "Configured"} · {relationshipProviderModelDisplayName ? "Model configured" : "Model ready"}</strong>
                  <small>{relationshipProviderEndpoint}</small>
                  {relationshipProviderModelDisplayName ? <small>Model: {relationshipProviderModelDisplayName}</small> : null}
                </div>
                <p className="link-discovery-assurance">
                  Suggestions will be sent to Inbox for approval. Nothing will be added to Graph until you approve it.
                </p>
                {pendingRelationshipSuggestions > 0 ? (
                  <div className="link-discovery-pending-note">
                    <strong>{pendingRelationshipSuggestions} suggestions already waiting in Inbox.</strong>
                    <Link className="button-link" to={projectPath(store.selectedProjectId, "/inbox")}>
                      Review Inbox
                    </Link>
                  </div>
                ) : null}
                <div className="docs-ai-relationship-actions">
                  <button
                    type="button"
                    className="icon-text-button primary"
                    disabled={!store.selectedProjectId || store.loading || semanticRunRunning || aiEligibleDocs.length === 0}
                    onClick={runRelationshipReview}
                  >
                    <Play size={14} />
                    {semanticRunRunning ? "Creating suggestions..." : "Create suggestions"}
                  </button>
                  <button
                    type="button"
                    className="icon-text-button"
                    onClick={closeLinkDiscoveryDialog}
                  >
                    {semanticRunRunning ? "Hide" : "Close"}
                  </button>
                  {(pendingRelationshipCount > 0 || semanticResult?.proposal) && pendingRelationshipSuggestions === 0 ? (
                    <Link className="button-link" to={semanticInboxPath}>
                      Review Inbox
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className={`icon-text-button ${showRelationshipAdvanced ? "selected" : ""}`}
                    disabled={store.loading || semanticRunRunning}
                    onClick={() => setShowRelationshipAdvanced((open) => !open)}
                    aria-expanded={showRelationshipAdvanced}
                  >
                    <Settings2 size={14} />
                    Advanced settings
                  </button>
                </div>
                {semanticDisplayRun ? (
                  <div className={`semantic-run-result ${semanticRunStatusClass(semanticDisplayRun)}`}>
                    <div className="semantic-analysis-header">
                      <strong>{semanticRunTitle(semanticDisplayRun, pendingRelationshipSuggestions, Boolean(semanticResult?.proposal))}</strong>
                      <span>{semanticRunPhase(semanticDisplayRun, semanticRunRunning)}</span>
                    </div>
                    {semanticRunRunning ? (
                      <SemanticRunProgress
                        className="semantic-run-progress"
                        ariaLabel="Graph link suggestion progress"
                        documentsProcessed={runProgress.documentsProcessed}
                        documentsTotal={runProgress.documentsTotal}
                        candidatesJudged={runProgress.candidatesJudged}
                        candidatesTotal={runProgress.candidatesTotal}
                      />
                    ) : null}
                    {semanticRunFinished ? (
                      <p className="semantic-run-result-copy">
                        {semanticRunCompletionCopy(semanticDisplayRun, pendingRelationshipSuggestions, Boolean(semanticResult?.proposal))}
                      </p>
                    ) : null}
                    <div className="link-discovery-metrics compact">
                      <span><strong>{semanticRunCounts.documentsAnalyzed || 0}</strong> new docs</span>
                      <span><strong>{semanticRunCounts.extractionsReused || 0}</strong> cached</span>
                      <span><strong>{semanticRunCounts.judged || 0}</strong> judged</span>
                      <span><strong>{semanticRunCounts.proposed || 0}</strong> proposed</span>
                      <span><strong>{semanticRunCounts.accepted || 0}</strong> approved</span>
                      <span><strong>{semanticRunCounts.discarded || 0}</strong> discarded</span>
                    </div>
                    {semanticRunFinished && (pendingRelationshipSuggestions > 0 || semanticResult?.proposal) ? (
                      <Link className="button-link primary" to={semanticInboxPath}>
                        Review suggestions in Inbox
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                {showRelationshipAdvanced ? (
                  <div className="semantic-run-advanced">
                    <p className="semantic-run-advanced-note">
                      Advanced settings are optional. Defaults are recommended for most runs.
                    </p>
                    <div className="semantic-run-advanced-section">
                      <h4>Review behavior</h4>
                      <SemanticRunForm
                        className="semantic-run-form-basic"
                        draft={relationshipRunDraft}
                        disabled={store.loading}
                        onPatch={updateRelationshipRunDraft}
                        fields={[
                          {
                            key: "mode",
                            label: "Review behavior",
                            options: [
                              { value: "review", label: "Send to Inbox for approval" },
                              { value: "dry-run", label: "Preview only" },
                              { value: "auto", label: "Auto-approve links" }
                            ]
                          }
                        ]}
                      />
                    </div>
                    <div className="semantic-run-advanced-section">
                      <h4>Run limits</h4>
                      <SemanticRunForm
                        draft={relationshipRunDraft}
                        disabled={store.loading}
                        onPatch={updateRelationshipRunDraft}
                        fields={[
                          { key: "maxDocuments", label: "Documents to scan", placeholder: "All" },
                          { key: "maxCandidates", label: "Total link candidates", placeholder: "All" },
                          { key: "maxCandidatesPerDocument", label: "Candidates per document" }
                        ]}
                      />
                    </div>
                    <div className="semantic-run-advanced-section">
                      <h4>AI request</h4>
                      <SemanticRunForm
                        draft={relationshipRunDraft}
                        disabled={store.loading}
                        onPatch={updateRelationshipRunDraft}
                        fields={[
                          { key: "endpoint", label: "Endpoint for this run", wide: true, placeholder: "Use provider default" },
                          { key: "model", label: "Model for this run", wide: true, placeholder: "Use provider default" },
                          { key: "apiKey", label: "API key for this run", placeholder: "Optional" },
                          { key: "maxOutputTokens", label: "Max response size" },
                          { key: "timeoutSeconds", label: "Request timeout (sec)" }
                        ]}
                      />
                    </div>
                    <div className="semantic-run-advanced-section">
                      <h4>Compatibility</h4>
                      <SemanticRunField
                        field={{ key: "jsonMode", label: "Require strict JSON output" }}
                        draft={relationshipRunDraft}
                        disabled={store.loading}
                        onPatch={updateRelationshipRunDraft}
                      />
                    </div>
                  </div>
                ) : null}
              </>
            )}
        </Modal>
      ) : null}
    </Screen>
  );
});

function semanticRunTitle(run: any, pendingSuggestions: number, hasProposal: boolean): string {
  if (run.status === "failed") return "Suggestion run failed";
  if (run.status === "cancelled") return "Suggestion run cancelled";
  if (run.status === "running" || run.status === "pending") return "Creating suggestions";
  if (run.mode === "dry-run") return "Dry run complete";
  if (pendingSuggestions > 0 || hasProposal) return "Suggestions ready for review";
  if ((run.counts?.accepted || 0) > 0) return "Links added to Graph";
  return "Suggestion run complete";
}

function semanticRunPhase(run: any, running: boolean): string {
  if (!running) return String(run.status || "latest run");
  const counts = run.counts || {};
  const documentsTotal = Number(counts.documentsTotal || 0);
  const documentsProcessed = Number(counts.documentsAnalyzed || 0) + Number(counts.extractionsReused || 0);
  if (documentsTotal > 0 && documentsProcessed < documentsTotal) return "Scanning documents";
  if (Number(counts.candidates || 0) > 0) return "Judging links";
  return "Preparing links";
}

function semanticRunStatusClass(run: any): string {
  if (run.status === "failed") return "failed";
  if (run.status === "cancelled") return "warning";
  if (run.status === "completed") return "completed";
  return "running";
}

function semanticRunCompletionCopy(run: any, pendingSuggestions: number, hasProposal: boolean): string {
  const counts = run.counts || {};
  if (run.status === "failed") return semanticRunErrorCopy(run.error);
  if (run.status === "cancelled") return "The run stopped before it could finish.";
  if (run.mode === "dry-run") return "The dry run finished without writing suggestions to Inbox.";
  if (pendingSuggestions > 0 || hasProposal) {
    return `${pendingSuggestions || counts.proposed || 0} suggestion${(pendingSuggestions || counts.proposed || 0) === 1 ? "" : "s"} are ready in Inbox.`;
  }
  if ((counts.accepted || 0) > 0) {
    return `${counts.accepted} link${counts.accepted === 1 ? "" : "s"} were approved and added to Graph.`;
  }
  return "No links passed the review thresholds for this run.";
}

function semanticRunErrorCopy(error: unknown): string {
  const message = String(error || "");
  if (message.includes("invalid JSON") || message.includes("no parseable JSON")) {
    return "The AI provider answered without valid JSON. Keep strict JSON output enabled, or use a model/provider that supports JSON object responses for document analysis.";
  }
  return message || "The provider or daemon stopped before suggestions could be created.";
}

function modelDisplayNameForLinkDiscovery(args: {
  assistantPolicy: any;
  providerCheck: any;
  modelId: string;
}): string {
  if (
    args.providerCheck?.ok &&
    args.providerCheck?.modelDisplayName &&
    (!args.modelId || args.providerCheck.model === args.modelId)
  ) {
    return String(args.providerCheck.modelDisplayName);
  }
  if (args.assistantPolicy?.modelDisplayName && args.assistantPolicy?.modelName === args.modelId) {
    return String(args.assistantPolicy.modelDisplayName);
  }
  return "";
}
