import { type FormEvent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { Empty, KeyValue, Panel, RawTextPreview, Screen } from "../components/layout.js";
import { DataTable } from "../components/DataTable.js";
import { ConfirmDeleteButton } from "../components/ConfirmDeleteButton.js";
import { DocumentEditorHost } from "../components/DocumentEditorHost.js";
import { WorkstreamStatusActions } from "../components/WorkstreamStatusActions.js";
import { MarkdownPreview } from "../components/markdown/MarkdownPreview.js";
import { searchResultTypeLabel, statusLabel, visibilityLabel } from "../utils/labels.js";
import { graphRulesFromProposalPatch } from "../utils/graph-proposals.js";

export const SearchScreen = observer(function SearchScreen() {
  const store = useStore();
  const [query, setQuery] = useState("");
  const [selectedResultId, setSelectedResultId] = useState("");
  const [editingDocId, setEditingDocId] = useState("");
  const searchRows = store.docs.searchResults.map((result) => {
    const doc = store.docs.list.find((candidate) => candidate.id === result.id);
    const resultKind = doc?.type === "diagram" ? "diagram" : result.type;
    return {
      ...result,
      resultType: result.type,
      kind: searchResultTypeLabel(resultKind),
      state: statusLabel(doc?.status || result.status),
      "AI access": visibilityLabel(doc?.visibility || result.visibility),
      type: resultKind
    };
  });
  const selectedResult = store.docs.searchResults.find((result) => result.id === selectedResultId);
  const selectedDoc = selectedResult?.type === "document"
    ? store.docs.list.find((doc) => doc.id === selectedResult.id)
    : undefined;
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
    }
  }, [store, selectedResult?.id, selectedResult?.type, selectedSession]);

  useEffect(() => {
    if (
      selectedResult?.type === "workstream" &&
      selectedWorkstream &&
      store.workstreams.detail?.workstream?.id !== selectedWorkstream.id
    ) {
      void store.workstreams.loadDetail(selectedWorkstream.id);
    }
  }, [store, selectedResult?.id, selectedResult?.type, selectedWorkstream, store.workstreams.detail?.workstream?.id]);

  function openSearchResult(row: any) {
    setSelectedResultId(row.id);
    if (row.resultType === "document") {
      setEditingDocId(row.id);
    }
  }

  return (
    <Screen title="Search This Project">
      <form className="inline-form" onSubmit={(event: FormEvent) => {
        event.preventDefault();
        setSelectedResultId("");
        void store.docs.search(query);
      }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions, docs, commands, gotchas, diagrams" />
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
      <DataTable
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
      {selectedResult ? (
        <SearchResultDetail
          result={selectedResult}
          doc={selectedDoc}
          session={selectedSession}
          workstream={selectedWorkstream}
          proposal={selectedProposal}
          workstreamDetail={store.workstreams.detail}
          store={store}
          onEditDoc={() => selectedDoc ? setEditingDocId(selectedDoc.id) : undefined}
        />
      ) : store.docs.searchResults.length ? null : (
        <Empty text="Run a search to inspect matching docs, diagrams, sessions, workstreams, and inbox proposals." />
      )}
      {editingDoc ? (
        <DocumentEditorHost doc={editingDoc} onClose={() => setEditingDocId("")} />
      ) : null}
    </Screen>
  );
});

function SearchResultDetail({
  result,
  doc,
  session,
  workstream,
  proposal,
  workstreamDetail,
  store,
  onEditDoc
}: {
  result: any;
  doc?: any;
  session?: any;
  workstream?: any;
  proposal?: any;
  workstreamDetail?: any;
  store: any;
  onEditDoc: () => void;
}) {
  if (result.type === "document") {
    const isDiagram = doc?.type === "diagram";
    return (
      <Panel title={isDiagram ? "Selected Diagram" : "Selected Document"}>
        <div className="button-row">
          <button type="button" disabled={!doc} onClick={onEditDoc}>
            {isDiagram ? "Open Diagram Editor" : "Open Document Editor"}
          </button>
          {doc ? (
            <ConfirmDeleteButton
              itemType="document"
              title={doc.title}
              critical={["overview", "privacy", "commands", "glossary"].includes(doc.type)}
              label="Move to Trash"
              onConfirm={() => store.docs.deleteDocument(doc.id)}
            />
          ) : null}
        </div>
        <div className="dashboard-grid tight">
          <KeyValue label="Kind" value={searchResultTypeLabel(doc?.type || result.type)} />
          <KeyValue label="State" value={statusLabel(doc?.status || result.status)} />
          <KeyValue label="AI access" value={visibilityLabel(doc?.visibility || result.visibility)} />
          <KeyValue label="Updated" value={doc?.updated || result.updated || "unknown"} />
          <KeyValue label="Path" value={<code className="path-value">{doc?.filePath || result.path || "memory"}</code>} />
        </div>
        {doc ? (
          <div className="search-result-detail">
            <MarkdownPreview body={doc.body || ""} />
          </div>
        ) : (
          <p className="panel-help">This search result was returned by the daemon, but the document is not loaded in the desktop store yet. Refresh the project and search again.</p>
        )}
      </Panel>
    );
  }

  if (result.type === "session") {
    return (
      <Panel title="Selected Session">
        <div className="button-row">
          {session ? (
            <ConfirmDeleteButton
              itemType="session"
              title={session.taskTitle}
              critical={session.status === "active"}
              label="Move to Trash"
              onConfirm={() => store.sessions.deleteSession(session.id)}
            />
          ) : null}
        </div>
        <div className="dashboard-grid tight">
          <KeyValue label="State" value={statusLabel(session?.status || result.status)} />
          <KeyValue label="Agent" value={session?.agent || "unknown"} />
          <KeyValue label="Updated" value={session?.updated || result.updated || "unknown"} />
          <KeyValue label="Path" value={<code className="path-value">{session?.filePath || result.path || "memory"}</code>} />
        </div>
        <RawTextPreview text={session?.body || result.snippet} fallback="Loading session body..." />
      </Panel>
    );
  }

  if (result.type === "workstream") {
    const detail = workstreamDetail?.workstream?.id === workstream?.id ? workstreamDetail : undefined;
    return (
      <Panel title="Selected Workstream">
        <div className="button-row">
          {workstream ? (
            <>
              <WorkstreamStatusActions workstream={workstream} />
              <ConfirmDeleteButton
                itemType="workstream"
                title={workstream.name}
                label="Move to Trash"
                onConfirm={() => store.workstreams.deleteWorkstream(workstream.id)}
              />
            </>
          ) : null}
        </div>
        <div className="dashboard-grid tight">
          <KeyValue label="State" value={statusLabel(workstream?.status || result.status)} />
          <KeyValue label="Topics" value={workstream?.topics?.join(", ") || "none"} />
          <KeyValue label="Sessions" value={detail?.sessions?.length || 0} />
          <KeyValue label="Documents" value={detail?.documents?.length || 0} />
          <KeyValue label="Path" value={<code className="path-value">{workstream?.filePath || result.path || "memory"}</code>} />
        </div>
        <RawTextPreview text={workstream?.body || result.snippet} fallback="Workstream details are loading." />
      </Panel>
    );
  }

  if (result.type === "proposed-update") {
    const graphProposalRules = proposal?.type === "graph-update"
      ? graphRulesFromProposalPatch(proposal.proposedPatch)
      : undefined;
    return (
      <Panel title="Selected Inbox Proposal">
        <div className="button-row">
          {proposal ? (
            <>
              <button type="button" onClick={() => store.inbox.updateStatus(proposal.id, "accepted")}>Mark Accepted</button>
              <button type="button" onClick={() => store.inbox.updateStatus(proposal.id, "rejected")}>Reject</button>
              {graphProposalRules ? (
                <button type="button" onClick={() => store.graph.applyGraphRulesProposal(proposal.id, graphProposalRules)}>
                  Apply Graph Rules
                </button>
              ) : null}
              <ConfirmDeleteButton
                itemType="inbox-proposal"
                title={proposal.reason || proposal.type}
                label="Move to Trash"
                onConfirm={() => store.inbox.deleteItem(proposal.id)}
              />
            </>
          ) : null}
        </div>
        <div className="dashboard-grid tight">
          <KeyValue label="Kind" value={searchResultTypeLabel(proposal?.type || result.type)} />
          <KeyValue label="State" value={statusLabel(proposal?.status || result.status)} />
          <KeyValue label="Confidence" value={proposal?.confidence || "unknown"} />
          <KeyValue label="Created" value={proposal?.created || result.updated || "unknown"} />
        </div>
        <RawTextPreview text={proposal?.proposedPatch || result.snippet} fallback="Proposal details are not loaded." />
      </Panel>
    );
  }

  return (
    <Panel title="Selected Search Result">
      <div className="dashboard-grid tight">
        <KeyValue label="Kind" value={searchResultTypeLabel(result.type)} />
        <KeyValue label="State" value={statusLabel(result.status)} />
        <KeyValue label="Path" value={<code className="path-value">{result.path || "memory"}</code>} />
      </div>
      <RawTextPreview text={result.snippet} fallback="No preview available." />
    </Panel>
  );
}
