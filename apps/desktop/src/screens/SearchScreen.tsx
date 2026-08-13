import { type FormEvent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import type {
  MemoryDocument,
  ProposedMemoryUpdate,
  SearchResult,
  Workstream,
  WorkstreamDetail
} from "@zharwing/memory-core";
import type { SessionListItem } from "../stores/session-store.js";
import { Empty, Screen } from "../components/layout.js";
import { DataTable } from "../components/DataTable.js";
import { DocumentEditorHost } from "../components/DocumentEditorHost.js";
import {
  SearchResultDetail,
  type SearchResultActions,
  type SearchResultDetailModel
} from "../components/search/SearchResultDetail.js";
import { searchResultTypeLabel, statusLabel, visibilityLabel } from "../utils/labels.js";
import { VisuallyHidden } from "../components/AccessibleStatus.js";
import { findDocumentForSearchResult } from "../utils/documents.js";

type SearchRow = SearchResult & {
  readonly resultType: SearchResult["type"];
  readonly kind: string;
  readonly state: string;
  readonly "AI access": string;
};

export const SearchScreen = observer(function SearchScreen() {
  const store = useStore();
  const searchState = store.docs.searchState;
  const [query, setQuery] = useState("");
  const [selectedResultId, setSelectedResultId] = useState("");
  const [editingDocId, setEditingDocId] = useState("");
  const searchRows: SearchRow[] = store.docs.searchResults.map((result) => {
    const doc = findDocumentForSearchResult(store.docs.list, result);
    const resultKind = doc?.type === "diagram" ? "diagram" : result.type;
    return {
      ...result,
      resultType: result.type,
      kind: searchResultTypeLabel(resultKind),
      state: statusLabel(doc?.status || result.status),
      "AI access": visibilityLabel(doc?.visibility || result.visibility),
      type: result.type
    };
  });
  const selectedResult = store.docs.searchResults.find((result) => result.id === selectedResultId);
  const selectedDoc = findDocumentForSearchResult(store.docs.list, selectedResult);
  const selectedSession = selectedResult?.type === "session"
    ? store.sessions.list.find((session) => session.id === selectedResult.id)
    : undefined;
  const selectedWorkstream = selectedResult?.type === "workstream"
    ? store.workstreams.list.find((workstream) => workstream.id === selectedResult.id)
    : undefined;
  const selectedProposal = selectedResult?.type === "proposed-update"
    ? store.inbox.items.find((item) => item.id === selectedResult.id)
    : undefined;
  const editingDoc = store.docs.list.find((doc) => doc.id === editingDocId);
  const selectedDetail = selectedResult ? createSearchResultDetailModel({
    result: selectedResult,
    document: selectedDoc,
    session: selectedSession,
    workstream: selectedWorkstream,
    proposal: selectedProposal,
    workstreamDetail: store.workstreams.detail
  }) : undefined;
  const detailActions: SearchResultActions = {
    editDocument: setEditingDocId,
    deleteDocument: (documentId) => store.docs.deleteDocument(documentId),
    deleteSession: (sessionId) => store.sessions.deleteSession(sessionId),
    deleteWorkstream: (workstreamId) => store.workstreams.deleteWorkstream(workstreamId),
    updateWorkstreamStatus: (workstreamId, status) => store.workstreams.updateStatus(workstreamId, status),
    updateProposalStatus: (proposalId, status) => store.inbox.updateStatus(proposalId, status),
    applyGraphRules: (proposalId, rules) => store.graph.applyGraphRulesProposal(proposalId, rules),
    deleteProposal: (proposalId) => store.inbox.deleteItem(proposalId)
  };

  useEffect(() => {
    if (!store.docs.searchResults.length) {
      setSelectedResultId("");
      return;
    }
    if (!store.docs.searchResults.some((result) => result.id === selectedResultId)) {
      setSelectedResultId(store.docs.searchResults[0].id);
    }
  }, [store.docs.searchResults, selectedResultId]);

  useEffect(() => {
    if (selectedResult?.type === "session" && !selectedSession) {
      void store.sessions.loadAll();
    } else if (selectedSession && selectedSession.body === undefined) {
      void store.sessions.loadDetail(selectedSession.id);
    }
  }, [store, selectedResult?.id, selectedResult?.type, selectedSession?.id, selectedSession?.body]);

  useEffect(() => {
    if (
      selectedResult?.type === "workstream" &&
      selectedWorkstream &&
      store.workstreams.detail?.workstream?.id !== selectedWorkstream.id
    ) {
      void store.workstreams.loadDetail(selectedWorkstream.id);
    }
  }, [store, selectedResult?.id, selectedResult?.type, selectedWorkstream, store.workstreams.detail?.workstream?.id]);

  function openSearchResult(row: SearchRow) {
    setSelectedResultId(row.id);
    if (row.resultType === "document") {
      const document = findDocumentForSearchResult(store.docs.list, row);
      if (document) setEditingDocId(document.id);
    }
  }

  return (
    <Screen title="Search This Project">
      <form className="inline-form" onSubmit={(event: FormEvent) => {
        event.preventDefault();
        setSelectedResultId("");
        void store.docs.search(query);
      }}>
        <VisuallyHidden as="div"><label htmlFor="project-search-query">Search query</label></VisuallyHidden>
        <input id="project-search-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions, docs, commands, gotchas, diagrams" autoComplete="off" />
        <button type="submit">Search</button>
      </form>
      <div className="notice docs-explainer">
        <strong>What the result fields mean</strong>
        <p>
          Kind is the record type. State is whether that record is active, draft, archived, or similar.
          AI access is the privacy setting: "AI can use" means the item is allowed into AI context when relevant.
        </p>
        <p>
          Snippet is the matching excerpt around your search term. Use Open or View to inspect the full record.
        </p>
      </div>
      {searchState.status === "loading" ? (
        <p className="panel-help" role="status">Searching this project...</p>
      ) : searchState.status === "failure" ? (
        <p className="panel-help" role="alert">Search could not be completed. Check the query and try again.</p>
      ) : (
        <DataTable
          ariaLabel="Project search results"
          columns={["kind", "state", "AI access", "title", "snippet"]}
          rows={searchRows}
          selectedRowId={selectedResultId}
          onRowClick={(row) => setSelectedResultId(row.id)}
          rowActions={(row) => (
            <button type="button" onClick={() => openSearchResult(row)}>
              {row.resultType === "document" ? "Open" : "View"}
            </button>
          )}
        />
      )}
      {selectedDetail ? (
        <SearchResultDetail
          model={selectedDetail}
          actions={detailActions}
        />
      ) : searchState.status === "empty" ? (
        <Empty text="No results matched this search." />
      ) : searchState.status === "idle" ? (
        <Empty text="Run a search to inspect matching docs, diagrams, sessions, workstreams, and inbox proposals." />
      ) : null}
      {editingDoc ? (
        <DocumentEditorHost
          doc={editingDoc}
          documents={store.docs}
          onClose={() => setEditingDocId("")}
        />
      ) : null}
    </Screen>
  );
});

function createSearchResultDetailModel(args: {
  result: SearchResult;
  document: MemoryDocument | undefined;
  session: SessionListItem | undefined;
  workstream: Workstream | undefined;
  proposal: ProposedMemoryUpdate | undefined;
  workstreamDetail: WorkstreamDetail | undefined;
}): SearchResultDetailModel {
  switch (args.result.type) {
    case "document":
      return { kind: "document", result: args.result, document: args.document };
    case "session":
      return { kind: "session", result: args.result, session: args.session };
    case "workstream":
      return {
        kind: "workstream",
        result: args.result,
        workstream: args.workstream,
        detail: args.workstreamDetail?.workstream.id === args.workstream?.id
          ? args.workstreamDetail
          : undefined
      };
    case "proposed-update":
      return { kind: "proposed-update", result: args.result, proposal: args.proposal };
    case "context-bundle":
      return { kind: "context-bundle", result: args.result };
  }
}
