import { type FormEvent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/store-context.js";
import type { SearchResult } from "@zharwing/memory-core";
import { Empty, Screen } from "../components/layout.js";
import { DataTable } from "../components/DataTable.js";
import { searchResultTypeLabel, statusLabel, visibilityLabel } from "../utils/labels.js";
import { VisuallyHidden } from "../components/AccessibleStatus.js";
import { findDocumentForSearchResult } from "../utils/documents.js";
import { resolveSearchTarget, searchTargetPath } from "../application/navigation/search-target.js";
import { useRouteQueryParam } from "../hooks/useSearchParamState.js";

type SearchRow = SearchResult & {
  readonly resultType: SearchResult["type"];
  readonly kind: string;
  readonly state: string;
  readonly "AI access": string;
};

export const SearchScreen = observer(function SearchScreen() {
  const store = useStore();
  const navigate = useNavigate();
  const searchState = store.docs.searchState;
  const [query, setQuery] = useRouteQueryParam("search", "q");
  const [selectedResultId, setSelectedResultId] = useState("");
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

  useEffect(() => {
    if (!store.docs.searchResults.length) {
      setSelectedResultId("");
      return;
    }
    if (!store.docs.searchResults.some((result) => result.id === selectedResultId)) {
      setSelectedResultId(store.docs.searchResults[0].id);
    }
  }, [store.docs.searchResults, selectedResultId]);

  function openSearchResult(row: SearchRow) {
    setSelectedResultId(row.id);
    const result = store.docs.searchResults.find((candidate) => candidate.id === row.id);
    const projectId = store.projects.selectedProjectId;
    if (!result || !projectId) return;
    const resolved = resolveSearchTarget(result, store.docs.list);
    if (resolved.status === "available") navigate(searchTargetPath(projectId, resolved.target));
  }

  return (
    <Screen title="Search This Project">
      <form className="inline-form" onSubmit={(event: FormEvent) => {
        event.preventDefault();
        setSelectedResultId("");
        void store.docs.search(query);
      }}>
        <VisuallyHidden as="div"><label htmlFor="project-search-query">Search query</label></VisuallyHidden>
        <input id="project-search-query" type="search" value={query} onChange={(event) => setQuery(event.target.value, { replace: true })} placeholder="Search sessions, docs, commands, gotchas, diagrams" autoComplete="off" />
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
      {searchState.status === "empty" ? (
        <Empty text="No results matched this search." />
      ) : searchState.status === "idle" ? (
        <Empty text="Run a search to inspect matching docs, diagrams, sessions, workstreams, and inbox proposals." />
      ) : null}
    </Screen>
  );
});
