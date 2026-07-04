import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useSearchParams } from "react-router-dom";
import { CircleHelp } from "lucide-react";
import { useStore } from "../stores/store-context.js";
import { Empty, Screen } from "../components/layout.js";
import { LibraryTabs } from "../components/SectionTabs.js";
import { DataTable } from "../components/DataTable.js";
import { DocumentEditorModal } from "../components/DocumentEditorModal.js";
import { filterDocuments, isStarterDraftDoc } from "../utils/documents.js";

export const DocsScreen = observer(function DocsScreen() {
  const store = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDocId, setSelectedDocId] = useState("");
  const [editingDocId, setEditingDocId] = useState(searchParams.get("doc") || "");
  const [filter, setFilter] = useState("all");
  const [showStarterDocsHelp, setShowStarterDocsHelp] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const docs = store.docs.filter((doc) => doc.type !== "diagram");
  const filteredDocs = filterDocuments(docs, filter);
  const starterDraftDocs = store.docs.filter(isStarterDraftDoc);
  const pageCount = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  const pageIndex = Math.min(page, pageCount - 1);
  const pagedDocs = filteredDocs.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const editingDoc = store.docs.find((doc) => doc.id === editingDocId);

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
        {paginationControls("top")}
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
    </Screen>
  );
});
