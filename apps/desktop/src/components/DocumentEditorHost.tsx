import { observer } from "mobx-react-lite";
import type { MemoryDocument } from "@zharwing/memory-core";
import { DocumentEditorModal } from "./DocumentEditorModal.js";

export interface DocumentEditorPort {
  readonly loading: boolean;
  updateDocument(
    documentId: string,
    changes: { title: string; body: string }
  ): Promise<MemoryDocument | undefined>;
  deleteDocument(documentId: string): Promise<void>;
}

/**
 * Standard wiring for DocumentEditorModal through a narrow document port.
 * Delete closes only after the operation settles; `onDeleted` overrides that
 * close for screens using `replace: true` history semantics.
 */
export const DocumentEditorHost = observer(function DocumentEditorHost({
  doc,
  documents,
  onClose,
  onDeleted
}: {
  doc: MemoryDocument;
  documents: DocumentEditorPort;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  return (
    <DocumentEditorModal
      doc={doc}
      saving={documents.loading}
      onClose={onClose}
      onSave={(changes) => documents.updateDocument(doc.id, changes)}
      onDelete={async () => {
        await documents.deleteDocument(doc.id);
        (onDeleted || onClose)();
      }}
    />
  );
});
