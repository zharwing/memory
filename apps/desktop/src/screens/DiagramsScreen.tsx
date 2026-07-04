import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../stores/store-context.js";
import { Empty, Screen } from "../components/layout.js";
import { LibraryTabs } from "../components/SectionTabs.js";
import { DataTable } from "../components/DataTable.js";
import { DocumentEditorModal } from "../components/DocumentEditorModal.js";

export const DiagramsScreen = observer(function DiagramsScreen() {
  const store = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editingDocId, setEditingDocId] = useState(searchParams.get("doc") || "");
  const diagrams = store.docs.filter((doc) => doc.type === "diagram");
  const editingDoc = diagrams.find((doc) => doc.id === editingDocId);

  useEffect(() => {
    const urlDocId = searchParams.get("doc") || "";
    setEditingDocId((current) => current === urlDocId ? current : urlDocId);
  }, [searchParams]);

  useEffect(() => {
    if (
      editingDocId &&
      store.docs.length > 0 &&
      !store.docs.some((doc) => doc.type === "diagram" && doc.id === editingDocId)
    ) {
      closeDiagramEditor(true);
    }
  }, [editingDocId, store.docs]);

  function updateDiagramsSearchParams(docId: string | null, replace = false) {
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      if (docId) nextParams.set("doc", docId);
      else nextParams.delete("doc");
      return nextParams;
    }, { replace });
  }

  function openDiagramEditor(doc: any) {
    setEditingDocId(doc.id);
    updateDiagramsSearchParams(doc.id);
  }

  function closeDiagramEditor(replace = false) {
    setEditingDocId("");
    updateDiagramsSearchParams(null, replace);
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
        <DocumentEditorModal
          doc={editingDoc}
          saving={store.loading}
          onClose={() => closeDiagramEditor()}
          onSave={(changes) => store.updateDocument(editingDoc.id, changes)}
          onDelete={async () => {
            await store.deleteDocument(editingDoc.id);
            closeDiagramEditor(true);
          }}
        />
      ) : null}
    </Screen>
  );
});
