import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CircleHelp, Play, Settings2, Sparkles, X } from "lucide-react";
import { useStore } from "../stores/store-context.js";
import { Empty, Screen } from "../components/layout.js";
import { LibraryTabs } from "../components/SectionTabs.js";
import { DataTable } from "../components/DataTable.js";
import { DocumentEditorModal } from "../components/DocumentEditorModal.js";
import { filterDocuments, isStarterDraftDoc } from "../utils/documents.js";
import { projectPath } from "../utils/routes.js";
import { semanticEdgesFromProposalPatch } from "../utils/semantic-proposals.js";
import { pendingInboxItems } from "../utils/inbox.js";

const defaultRelationshipRunDraft = {
  mode: "review",
  endpoint: "",
  model: "",
  apiKey: "",
  maxDocuments: "",
  maxCandidates: "",
  maxCandidatesPerDocument: "8",
  timeoutSeconds: "120",
  maxOutputTokens: "1024",
  jsonMode: false
};

export const DocsScreen = observer(function DocsScreen() {
  const store = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDocId, setSelectedDocId] = useState("");
  const [editingDocId, setEditingDocId] = useState(searchParams.get("doc") || "");
  const [filter, setFilter] = useState("all");
  const [showStarterDocsHelp, setShowStarterDocsHelp] = useState(false);
  const [showLinkDiscoveryDialog, setShowLinkDiscoveryDialog] = useState(false);
  const [showRelationshipAdvanced, setShowRelationshipAdvanced] = useState(false);
  const [relationshipRunDraft, setRelationshipRunDraft] = useState(() => ({ ...defaultRelationshipRunDraft }));
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const docs = store.docs.filter((doc) => doc.type !== "diagram");
  const aiEligibleDocs = docs.filter((doc) => doc.visibility !== "ai-excluded");
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
  const assistantPolicy = store.summary?.project?.assistantPolicy || store.selectedProject?.assistantPolicy || {};
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

  useEffect(() => {
    const urlDocId = searchParams.get("doc") || "";
    setEditingDocId((current) => current === urlDocId ? current : urlDocId);
    setSelectedDocId((current) => current === urlDocId ? current : urlDocId);
  }, [searchParams]);

  useEffect(() => {
    if (editingDocId && store.docs.length > 0 && !store.docs.some((doc) => doc.id === editingDocId)) {
      closeDocEditor(true);
    }
  }, [editingDocId, store.docs]);

  function updateDocsSearchParams(docId: string | null, replace = false) {
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      if (docId) nextParams.set("doc", docId);
      else nextParams.delete("doc");
      return nextParams;
    }, { replace });
  }

  function chooseFilter(nextFilter: string) {
    setFilter(nextFilter);
    setShowStarterDocsHelp(false);
    setPage(0);
    setSelectedDocId("");
  }

  function openDocEditor(doc: any) {
    setSelectedDocId(doc.id);
    setEditingDocId(doc.id);
    updateDocsSearchParams(doc.id);
  }

  function closeDocEditor(replace = false) {
    setEditingDocId("");
    updateDocsSearchParams(null, replace);
  }

  function updateRelationshipRunDraft(patch: Partial<typeof relationshipRunDraft>) {
    setRelationshipRunDraft((current) => ({ ...current, ...patch }));
  }

  function openLinkDiscoveryDialog() {
    setShowRelationshipAdvanced(false);
    setRelationshipRunDraft({ ...defaultRelationshipRunDraft });
    setShowLinkDiscoveryDialog(true);
  }

  function closeLinkDiscoveryDialog() {
    setShowRelationshipAdvanced(false);
    setRelationshipRunDraft({ ...defaultRelationshipRunDraft });
    setShowLinkDiscoveryDialog(false);
  }

  function runRelationshipReview() {
    const mode = relationshipRunDraft.mode || "review";
    void store.analyzeSemanticGraph({
      mode,
      dryRun: mode === "dry-run",
      scope: { kind: "all-docs" },
      endpoint: relationshipRunDraft.endpoint.trim() || undefined,
      model: relationshipRunDraft.model.trim() || undefined,
      apiKey: relationshipRunDraft.apiKey.trim() || undefined,
      maxDocuments: numberOrUndefined(relationshipRunDraft.maxDocuments),
      maxCandidates: numberOrUndefined(relationshipRunDraft.maxCandidates),
      maxCandidatesPerDocument: numberOrUndefined(relationshipRunDraft.maxCandidatesPerDocument),
      timeoutMs: secondsToMilliseconds(relationshipRunDraft.timeoutSeconds),
      maxOutputTokens: numberOrUndefined(relationshipRunDraft.maxOutputTokens),
      jsonMode: Boolean(relationshipRunDraft.jsonMode)
    });
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
          <div className="option-chips" aria-label="Document filters">
            {[
              ["all", `All (${docs.length})`],
              ["imported", `Imported (${filterDocuments(docs, "imported").length})`],
              ["draft", `Draft (${filterDocuments(docs, "draft").length})`]
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "selected" : ""}
                onClick={() => chooseFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
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
        <DocumentEditorModal
          doc={editingDoc}
          saving={store.loading}
          onClose={() => closeDocEditor()}
          onSave={(changes) => store.updateDocument(editingDoc.id, changes)}
          onDelete={async () => {
            await store.deleteDocument(editingDoc.id);
            closeDocEditor(true);
          }}
        />
      ) : null}
      {showLinkDiscoveryDialog ? (
        <div
          className="dialog-backdrop link-discovery-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLinkDiscoveryDialog();
          }}
        >
          <section className="link-discovery-dialog" role="dialog" aria-modal="true" aria-label="Suggest graph links">
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
                    disabled={!store.selectedProjectId || store.loading || aiEligibleDocs.length === 0}
                    onClick={runRelationshipReview}
                  >
                    <Play size={14} />
                    {store.loading ? "Creating suggestions..." : "Create suggestions"}
                  </button>
                  <button
                    type="button"
                    className="icon-text-button"
                    disabled={store.loading}
                    onClick={closeLinkDiscoveryDialog}
                  >
                    Cancel
                  </button>
                  {(pendingRelationshipCount > 0 || semanticResult?.proposal) && pendingRelationshipSuggestions === 0 ? (
                    <Link className="button-link" to={projectPath(store.selectedProjectId, "/inbox")}>
                      Review Inbox
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className={`icon-text-button ${showRelationshipAdvanced ? "selected" : ""}`}
                    disabled={store.loading}
                    onClick={() => setShowRelationshipAdvanced((open) => !open)}
                    aria-expanded={showRelationshipAdvanced}
                  >
                    <Settings2 size={14} />
                    Advanced settings
                  </button>
                </div>
                {showRelationshipAdvanced ? (
                  <div className="semantic-run-advanced">
                    <p className="semantic-run-advanced-note">
                      Advanced settings are optional. Defaults are recommended for most runs.
                    </p>
                    <div className="semantic-run-advanced-section">
                      <h4>Review behavior</h4>
                      <div className="semantic-run-form semantic-run-form-basic">
                        <label>
                          <span>Review behavior</span>
                          <select
                            value={relationshipRunDraft.mode}
                            disabled={store.loading}
                            onChange={(event) => updateRelationshipRunDraft({ mode: event.target.value })}
                          >
                            <option value="review">Send to Inbox for approval</option>
                            <option value="dry-run">Preview only</option>
                            <option value="auto">Auto-approve links</option>
                          </select>
                        </label>
                      </div>
                    </div>
                    <div className="semantic-run-advanced-section">
                      <h4>Run limits</h4>
                      <div className="semantic-run-form">
                        <label>
                          <span>Documents to scan</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={relationshipRunDraft.maxDocuments}
                            disabled={store.loading}
                            onChange={(event) => updateRelationshipRunDraft({ maxDocuments: event.target.value })}
                            placeholder="All"
                          />
                        </label>
                        <label>
                          <span>Total link candidates</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={relationshipRunDraft.maxCandidates}
                            disabled={store.loading}
                            onChange={(event) => updateRelationshipRunDraft({ maxCandidates: event.target.value })}
                            placeholder="All"
                          />
                        </label>
                        <label>
                          <span>Candidates per document</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={relationshipRunDraft.maxCandidatesPerDocument}
                            disabled={store.loading}
                            onChange={(event) => updateRelationshipRunDraft({ maxCandidatesPerDocument: event.target.value })}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="semantic-run-advanced-section">
                      <h4>AI request</h4>
                      <div className="semantic-run-form">
                        <label className="semantic-run-wide">
                          <span>Endpoint for this run</span>
                          <input
                            value={relationshipRunDraft.endpoint}
                            disabled={store.loading}
                            onChange={(event) => updateRelationshipRunDraft({ endpoint: event.target.value })}
                            placeholder="Use provider default"
                          />
                        </label>
                        <label className="semantic-run-wide">
                          <span>Model for this run</span>
                          <input
                            value={relationshipRunDraft.model}
                            disabled={store.loading}
                            onChange={(event) => updateRelationshipRunDraft({ model: event.target.value })}
                            placeholder="Use provider default"
                          />
                        </label>
                        <label>
                          <span>API key for this run</span>
                          <input
                            type="password"
                            value={relationshipRunDraft.apiKey}
                            disabled={store.loading}
                            onChange={(event) => updateRelationshipRunDraft({ apiKey: event.target.value })}
                            placeholder="Optional"
                          />
                        </label>
                        <label>
                          <span>Max response size</span>
                          <input
                            type="number"
                            min="128"
                            step="128"
                            value={relationshipRunDraft.maxOutputTokens}
                            disabled={store.loading}
                            onChange={(event) => updateRelationshipRunDraft({ maxOutputTokens: event.target.value })}
                          />
                        </label>
                        <label>
                          <span>Request timeout (sec)</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={relationshipRunDraft.timeoutSeconds}
                            disabled={store.loading}
                            onChange={(event) => updateRelationshipRunDraft({ timeoutSeconds: event.target.value })}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="semantic-run-advanced-section">
                      <h4>Compatibility</h4>
                      <label className="checkbox-row semantic-json-mode">
                        <input
                          type="checkbox"
                          checked={Boolean(relationshipRunDraft.jsonMode)}
                          disabled={store.loading}
                          onChange={(event) => updateRelationshipRunDraft({ jsonMode: event.target.checked })}
                        />
                        <span>Require strict JSON output</span>
                      </label>
                    </div>
                  </div>
                ) : null}
                {semanticResult?.run ? (
                  <div className="semantic-run-result">
                    <div className="semantic-analysis-header">
                      <strong>{semanticResult.run.status}</strong>
                      <span>{semanticResult.run.mode}</span>
                    </div>
                    <div className="link-discovery-metrics compact">
                      <span><strong>{semanticResult.run.counts?.documentsAnalyzed || 0}</strong> new docs</span>
                      <span><strong>{semanticResult.run.counts?.extractionsReused || 0}</strong> cached</span>
                      <span><strong>{semanticResult.run.counts?.proposed || 0}</strong> proposed</span>
                      <span><strong>{semanticLatestRun?.status || "No runs"}</strong> latest run</span>
                    </div>
                    {semanticResult.proposal ? (
                      <Link className="button-link primary" to={projectPath(store.selectedProjectId, "/inbox")}>
                        Review suggestions
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : null}
    </Screen>
  );
});

function numberOrUndefined(input: string): number | undefined {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function secondsToMilliseconds(input: string): number | undefined {
  const seconds = numberOrUndefined(input);
  return seconds ? seconds * 1000 : undefined;
}

function providerLabel(runtimeType: string): string {
  if (runtimeType === "lm-studio") return "LM Studio";
  if (runtimeType === "ollama") return "Ollama";
  if (runtimeType === "llama-cpp") return "llama.cpp server";
  if (runtimeType === "openai") return "OpenAI API";
  if (runtimeType === "anthropic") return "Claude API";
  if (runtimeType === "custom-openai-compatible") return "OpenAI-compatible API";
  if (runtimeType === "app-managed-llamacpp") return "App-managed local model";
  return "AI provider";
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
