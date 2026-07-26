import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { DocumentEditorModal } from "./DocumentEditorModal.js";

/**
 * Standard wiring for DocumentEditorModal: save goes through
 * `store.updateDocument`, delete goes through `store.deleteDocument` and
 * then closes. `onDeleted` overrides the close call after a delete (for
 * screens that close with `replace: true` history semantics).
 */
export const DocumentEditorHost = observer(function DocumentEditorHost({
  doc,
  onClose,
  onDeleted
}: {
  doc: any;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const store = useStore();

  return (
    <DocumentEditorModal
      doc={doc}
      saving={store.loading}
      onClose={onClose}
      onSave={(changes) => store.updateDocument(doc.id, changes)}
      onDelete={async () => {
        await store.deleteDocument(doc.id);
        (onDeleted || onClose)();
      }}
    />
  );
});
