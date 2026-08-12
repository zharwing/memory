import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { Empty, Screen } from "../components/layout.js";
import { LibraryTabs } from "../components/SectionTabs.js";
import { DataTable } from "../components/DataTable.js";
import { DocumentEditorHost } from "../components/DocumentEditorHost.js";
import { useCloseWhenMissing, useSearchParamState } from "../hooks/useSearchParamState.js";
import { timestampRenderers } from "../utils/format.js";

export const DiagramsScreen = observer(function DiagramsScreen() {
  const store = useStore();
  const [editingDocId, setDocSearchParam] = useSearchParamState("doc");
  const diagrams = store.docs.list.filter((doc) => doc.type === "diagram");
  const docsState = store.docs.listState;
  const docsCompleteness = store.docs.listResource.completeness;
  const docsObservationComplete =
    (docsState.status === "success" || docsState.status === "empty") &&
    docsCompleteness?.kind === "complete";
  const docsObservationPartial =
    (docsState.status === "success" || docsState.status === "refreshing") &&
    docsCompleteness?.kind === "partial";
  const editingDoc = diagrams.find((doc) => doc.id === editingDocId);

  useCloseWhenMissing(
    editingDocId,
    store.docs.list.length > 0 && !store.docs.list.some((doc) => doc.type === "diagram" && doc.id === editingDocId),
    () => closeDiagramEditor(true)
  );

  function openDiagramEditor(doc: any) {
    setDocSearchParam(doc.id);
  }

  function closeDiagramEditor(replace = false) {
    setDocSearchParam(null, { replace });
  }

  return (
    <Screen title="Diagrams">
      <LibraryTabs />
      {diagrams.length > 0 && docsState.status !== "failure" ? (
        <DataTable
          columns={["updated", "status", "visibility", "title", "format"]}
          rows={diagrams}
          renderers={timestampRenderers("updated")}
          selectedRowId={editingDocId}
          onRowClick={openDiagramEditor}
          rowActions={(doc) => (
            <button type="button" onClick={() => openDiagramEditor(doc)}>
              Edit
            </button>
          )}
        />
      ) : null}
      {docsState.status === "idle" || docsState.status === "loading" ? (
        <p className="panel-help" role="status">Loading diagrams...</p>
      ) : docsState.status === "failure" ? (
        <p className="panel-help" role="alert">Diagrams could not be loaded. Refresh to try again.</p>
      ) : docsState.status === "refreshing" ? (
        <p className="panel-help" role="status">
          Refreshing diagrams{diagrams.length ? "; showing the last accepted result" : ""}...
        </p>
      ) : docsObservationPartial ? (
        <p className="panel-help" role="status">
          Showing a partial document result; more diagrams may exist.
        </p>
      ) : docsObservationComplete && diagrams.length === 0 ? (
        <Empty text="No diagrams yet. Mermaid diagram documents will appear here." />
      ) : null}
      {editingDoc ? (
        <DocumentEditorHost
          doc={editingDoc}
          onClose={() => closeDiagramEditor()}
          onDeleted={() => closeDiagramEditor(true)}
        />
      ) : null}
    </Screen>
  );
});
