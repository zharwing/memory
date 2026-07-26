import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { Empty, Screen } from "../components/layout.js";
import { LibraryTabs } from "../components/SectionTabs.js";
import { DataTable } from "../components/DataTable.js";
import { DocumentEditorHost } from "../components/DocumentEditorHost.js";
import { useCloseWhenMissing, useSearchParamState } from "../hooks/useSearchParamState.js";

export const DiagramsScreen = observer(function DiagramsScreen() {
  const store = useStore();
  const [editingDocId, setDocSearchParam] = useSearchParamState("doc");
  const diagrams = store.docs.filter((doc) => doc.type === "diagram");
  const editingDoc = diagrams.find((doc) => doc.id === editingDocId);

  useCloseWhenMissing(
    editingDocId,
    store.docs.length > 0 && !store.docs.some((doc) => doc.type === "diagram" && doc.id === editingDocId),
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
      <DataTable
        columns={["updated", "status", "visibility", "title", "format"]}
        rows={diagrams}
        selectedRowId={editingDocId}
        onRowClick={openDiagramEditor}
        rowActions={(doc) => (
          <button type="button" onClick={() => openDiagramEditor(doc)}>
            Edit
          </button>
        )}
      />
      {diagrams.length === 0 ? <Empty text="No diagrams yet. Mermaid diagram documents will appear here." /> : null}
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
