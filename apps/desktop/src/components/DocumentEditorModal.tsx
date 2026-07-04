import { useEffect, useState } from "react";
import { KeyValue } from "./layout.js";
import { ConfirmDeleteButton } from "./ConfirmDeleteButton.js";
import { MarkdownPreview } from "./markdown/MarkdownPreview.js";

export function DocumentEditorModal({
  doc,
  saving,
  onClose,
  onSave,
  onDelete
}: {
  doc: any;
  saving: boolean;
  onClose: () => void;
  onSave: (changes: { title: string; body: string }) => Promise<any>;
  onDelete: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"markdown" | "preview">("markdown");
  const [title, setTitle] = useState(doc.title || "");
  const [body, setBody] = useState(doc.body || "");
  const [savedTitle, setSavedTitle] = useState(doc.title || "");
  const [savedBody, setSavedBody] = useState(doc.body || "");
  const dirty = title !== savedTitle || body !== savedBody;

  useEffect(() => {
    setMode("markdown");
    setTitle(doc.title || "");
    setBody(doc.body || "");
    setSavedTitle(doc.title || "");
    setSavedBody(doc.body || "");
  }, [doc.id]);

  async function requestClose() {
    if (dirty && !window.confirm("Discard unsaved document changes?")) return;
    onClose();
  }

  async function saveDocument() {
    if (!title.trim()) return;
    const updated = await onSave({ title: title.trim(), body });
    if (!updated) return;
    setTitle(updated.title || title.trim());
    setBody(typeof updated.body === "string" ? updated.body : body);
    setSavedTitle(updated.title || title.trim());
    setSavedBody(typeof updated.body === "string" ? updated.body : body);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        event.preventDefault();
        void requestClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) void requestClose();
      }}
    >
      <section className="document-modal" role="dialog" aria-modal="true" aria-label={`Edit ${doc.title}`}>
        <header className="document-modal-header">
          <div className="document-title-block">
            <input
              className="document-title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Document title"
              placeholder="Document title"
            />
            <div className="doc-badges">
              <span>{doc.type}</span>
              <span>{doc.status}</span>
              <span>{doc.visibility}</span>
              <span>{dirty ? "unsaved" : "saved"}</span>
            </div>
          </div>
          <div className="document-modal-actions">
            <ConfirmDeleteButton
              itemType="document"
              title={doc.title}
              critical={["overview", "privacy", "commands", "glossary"].includes(doc.type)}
              label="Move to Trash"
              onConfirm={onDelete}
            />
            <button type="button" onClick={() => void requestClose()}>Close</button>
            <button type="button" disabled={!dirty || saving || !title.trim()} onClick={() => void saveDocument()}>
              Save
            </button>
          </div>
        </header>
        <div className="document-modal-meta">
          <KeyValue label="Updated" value={doc.updated} />
          <KeyValue label="Import profile" value={doc.importProfile || "none"} />
          <KeyValue label="Source" value={<code className="path-value">{doc.filePath || "memory"}</code>} />
          <KeyValue label="Imported from" value={<code className="path-value">{doc.importSourcePath || "not imported"}</code>} />
        </div>
        <div className="document-editor-toolbar">
          <div className="segmented-control compact" role="group" aria-label="Document editor mode">
            <button type="button" className={mode === "markdown" ? "selected" : ""} onClick={() => setMode("markdown")}>
              Markdown
            </button>
            <button type="button" className={mode === "preview" ? "selected" : ""} onClick={() => setMode("preview")}>
              Preview
            </button>
          </div>
        </div>
        <div className="document-editor-body">
          {mode === "markdown" ? (
            <textarea
              className="markdown-source-editor"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              spellCheck={false}
              aria-label="Markdown source"
            />
          ) : (
            <MarkdownPreview body={body} />
          )}
        </div>
      </section>
    </div>
  );
}
