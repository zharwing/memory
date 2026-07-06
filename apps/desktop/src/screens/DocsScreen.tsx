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

export const DocsScreen = observer(function DocsScreen() {
  const store = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDocId, setSelectedDocId] = useState("");
  const [editingDocId, setEditingDocId] = useState(searchParams.get("doc") || "");
  const [filter, setFilter] = useState("all");
  const [showStarterDocsHelp, setShowStarterDocsHelp] = useState(false);
  const [showLinkDiscoveryDialog, setShowLinkDiscoveryDialog] = useState(false);
  const [showRelationshipAdvanced, setShowRelationshipAdvanced] = useState(false);
  const [relationshipRunDraft, setRelationshipRunDraft] = useState({
    mode: "review",
    endpoint: "",
    model: "",
    apiKey: "",
    maxDocuments: "",
    maxCandidates: "",
    maxCandidatesPerDocument: "8",
    timeoutMs: "120000",
    maxOutputTokens: "1024",
    jsonMode: false
  });
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
  const relationshipProviderEndpoint = relationshipRunDraft.endpoint.trim() || assistantPolicy.endpoint || "";
  const relationshipProviderModel = relationshipRunDraft.model.trim() || store.semanticGraphSettings?.model || assistantPolicy.modelName || "";
  const relationshipProviderName = providerLabel(assistantRuntimeType);
  const relationshipProviderModelDisplayName = modelDisplayNameForLinkDiscovery({
    assistantPolicy,
    providerCheck: store.assistantProviderCheck,
    modelId: relationshipProviderModel
  });
  const relationshipProviderReady = Boolean(relationshipProviderEndpoint && relationshipProviderModel);
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
    setRelationshipRunDraft((current) => ({
      ...current,
      endpoint: current.endpoint || assistantPolicy.endpoint || "",
      model: current.model || store.semanticGraphSettings?.model || assistantPolicy.modelName || ""
    }));
  }, [store.selectedProjectId, store.semanticGraphSettings?.model, assistantPolicy.endpoint, assistantPolicy.modelName]);

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
      timeoutMs: numberOrUndefined(relationshipRunDraft.timeoutMs),
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
            onClick={() => setShowLinkDiscoveryDialog(true)}
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
            if (event.target === event.currentTarget) setShowLinkDiscoveryDialog(false);
          }}
        >
          <section className="link-discovery-dialog" role="dialog" aria-modal="true" aria-label="Find document links">
            <header className="link-discovery-header">
              <div>
                <span className="section-kicker">AI link discovery</span>
                <h3>Find document links</h3>
              </div>
              <button
                type="button"
                className="icon-button icon-only"
                onClick={() => setShowLinkDiscoveryDialog(false)}
                title="Close"
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <p className="link-discovery-copy">
              AI scans eligible docs and suggests connections. Review suggestions in Inbox; approved links appear in Graph.
            </p>
            <div className="link-discovery-metrics" aria-label="Link discovery metrics">
              <span><strong>{aiEligibleDocs.length}</strong> eligible docs</span>
              <span><strong>{savedLinkCount}</strong> saved links</span>
              <span><strong>{pendingRelationshipSuggestions}</strong> pending suggestions</span>
            </div>
            {!relationshipProviderReady ? (
              <div className="link-discovery-provider-required">
                <AlertCircle size={18} aria-hidden="true" />
                <div>
                  <strong>AI provider required</strong>
                  <p>Connect an AI provider to suggest graph links for this project.</p>
                </div>
                <Link className="button-link primary" to={projectPath(store.selectedProjectId, "/assistant")}>
                  Configure AI provider
                </Link>
              </div>
            ) : (
              <>
                <div className="link-discovery-provider-ready">
                  <span>Provider</span>
                  <strong>{relationshipProviderName}</strong>
                  <small>{relationshipProviderEndpoint}</small>
                  <small>{relationshipProviderModelDisplayName ? `Model: ${relationshipProviderModelDisplayName}` : "Model configured"}</small>
                </div>
                <div className="docs-ai-relationship-actions">
                  <button
                    type="button"
                    className="icon-text-button primary"
                    disabled={!store.selectedProjectId || store.loading || aiEligibleDocs.length === 0}
                    onClick={runRelationshipReview}
                  >
                    <Play size={14} />
                    Find links
                  </button>
                  {pendingRelationshipCount > 0 || semanticResult?.proposal ? (
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
                    Advanced
                  </button>
                </div>
                {showRelationshipAdvanced ? (
                  <div className="semantic-run-advanced">
                    <div className="semantic-run-form">
                      <label>
                        <span>Mode</span>
                        <select
                          value={relationshipRunDraft.mode}
                          disabled={store.loading}
                          onChange={(event) => updateRelationshipRunDraft({ mode: event.target.value })}
                        >
                          <option value="review">Review</option>
                          <option value="dry-run">Dry run</option>
                          <option value="auto">Auto</option>
                        </select>
                      </label>
                      <label>
                        <span>Endpoint override</span>
                        <input
                          value={relationshipRunDraft.endpoint}
                          disabled={store.loading}
                          onChange={(event) => updateRelationshipRunDraft({ endpoint: event.target.value })}
                          placeholder={assistantPolicy.endpoint || "http://127.0.0.1:1234/v1"}
                        />
                      </label>
                      <label>
                        <span>Model override</span>
                        <input
                          value={relationshipRunDraft.model}
                          disabled={store.loading}
                          onChange={(event) => updateRelationshipRunDraft({ model: event.target.value })}
                          placeholder={store.semanticGraphSettings?.model || assistantPolicy.modelName || "local model"}
                        />
                      </label>
                      <label>
                        <span>API key</span>
                        <input
                          type="password"
                          value={relationshipRunDraft.apiKey}
                          disabled={store.loading}
                          onChange={(event) => updateRelationshipRunDraft({ apiKey: event.target.value })}
                          placeholder="optional"
                        />
                      </label>
                      <label>
                        <span>Max docs</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={relationshipRunDraft.maxDocuments}
                          disabled={store.loading}
                          onChange={(event) => updateRelationshipRunDraft({ maxDocuments: event.target.value })}
                          placeholder="all"
                        />
                      </label>
                      <label>
                        <span>Max candidates</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={relationshipRunDraft.maxCandidates}
                          disabled={store.loading}
                          onChange={(event) => updateRelationshipRunDraft({ maxCandidates: event.target.value })}
                          placeholder="all"
                        />
                      </label>
                      <label>
                        <span>Per doc</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={relationshipRunDraft.maxCandidatesPerDocument}
                          disabled={store.loading}
                          onChange={(event) => updateRelationshipRunDraft({ maxCandidatesPerDocument: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>Timeout ms</span>
                        <input
                          type="number"
                          min="1000"
                          step="1000"
                          value={relationshipRunDraft.timeoutMs}
                          disabled={store.loading}
                          onChange={(event) => updateRelationshipRunDraft({ timeoutMs: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>Output tokens</span>
                        <input
                          type="number"
                          min="128"
                          step="128"
                          value={relationshipRunDraft.maxOutputTokens}
                          disabled={store.loading}
                          onChange={(event) => updateRelationshipRunDraft({ maxOutputTokens: event.target.value })}
                        />
                      </label>
                      <label className="checkbox-row semantic-json-mode">
                        <input
                          type="checkbox"
                          checked={Boolean(relationshipRunDraft.jsonMode)}
                          disabled={store.loading}
                          onChange={(event) => updateRelationshipRunDraft({ jsonMode: event.target.checked })}
                        />
                        <span>Provider JSON mode</span>
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
