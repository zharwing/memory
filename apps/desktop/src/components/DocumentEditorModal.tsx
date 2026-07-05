import { type FormEvent, useEffect, useRef, useState } from "react";
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
  const [mode, setMode] = useState<"preview" | "markdown">("preview");
  const [title, setTitle] = useState(doc.title || "");
  const [body, setBody] = useState(doc.body || "");
  const [savedTitle, setSavedTitle] = useState(doc.title || "");
  const [savedBody, setSavedBody] = useState(doc.body || "");
  const richBodyRef = useRef(doc.body || "");
  const [richDirty, setRichDirty] = useState(false);
  const draftBody = richDirty ? richBodyRef.current : body;
  const dirty = title !== savedTitle || draftBody !== savedBody;

  useEffect(() => {
    setMode("preview");
    setTitle(doc.title || "");
    setBody(doc.body || "");
    richBodyRef.current = doc.body || "";
    setRichDirty(false);
    setSavedTitle(doc.title || "");
    setSavedBody(doc.body || "");
  }, [doc.id]);

  async function requestClose() {
    if (dirty && !window.confirm("Discard unsaved document changes?")) return;
    onClose();
  }

  async function saveDocument() {
    if (!title.trim()) return;
    const bodyToSave = currentBody();
    const updated = await onSave({ title: title.trim(), body: bodyToSave });
    if (!updated) return;
    const nextBody = typeof updated.body === "string" ? updated.body : bodyToSave;
    setTitle(updated.title || title.trim());
    setBody(nextBody);
    richBodyRef.current = nextBody;
    setRichDirty(false);
    setSavedTitle(updated.title || title.trim());
    setSavedBody(nextBody);
  }

  function currentBody() {
    return richDirty ? richBodyRef.current : body;
  }

  function switchEditorMode(nextMode: "preview" | "markdown") {
    if (nextMode === "markdown" && richDirty) {
      setBody(richBodyRef.current);
      setRichDirty(false);
    }
    setMode(nextMode);
  }

  function updateRichBody(event: FormEvent<HTMLDivElement>) {
    richBodyRef.current = markdownFromEditable(event.currentTarget);
    if (!richDirty) setRichDirty(true);
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
            <button type="button" className={mode === "preview" ? "selected" : ""} onClick={() => switchEditorMode("preview")}>
              Preview
            </button>
            <button type="button" className={mode === "markdown" ? "selected" : ""} onClick={() => switchEditorMode("markdown")}>
              Markdown
            </button>
          </div>
        </div>
        <div className="document-editor-body">
          {mode === "preview" ? (
            <MarkdownPreview
              body={body}
              editable
              ariaLabel="Rendered document editor"
              onInput={updateRichBody}
            />
          ) : (
            <textarea
              className="markdown-source-editor"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              spellCheck={false}
              aria-label="Markdown source"
            />
          )}
        </div>
      </section>
    </div>
  );
}

function markdownFromEditable(root: HTMLElement): string {
  const blocks: string[] = [];
  for (const child of Array.from(root.childNodes)) {
    const markdown = markdownFromEditableNode(child);
    if (markdown.trim()) blocks.push(markdown.trimEnd());
  }
  return blocks.join("\n\n");
}

function markdownFromEditableNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (!(node instanceof HTMLElement)) return "";

  const tag = node.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag.slice(1)))} ${editableText(node)}`;
  if (tag === "ul") {
    return Array.from(node.querySelectorAll(":scope > li"))
      .map((item) => `- ${editableText(item as HTMLElement)}`)
      .join("\n");
  }
  if (tag === "ol") {
    return Array.from(node.querySelectorAll(":scope > li"))
      .map((item, index) => `${index + 1}. ${editableText(item as HTMLElement)}`)
      .join("\n");
  }
  if (tag === "blockquote") {
    return editableText(node)
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }
  if (tag === "pre") return `\`\`\`\n${node.textContent || ""}\n\`\`\``;
  if (tag === "hr") return "---";
  if (tag === "table") return markdownTableFromEditable(node);
  return editableText(node);
}

function markdownTableFromEditable(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th,td")).map((cell) => editableText(cell as HTMLElement))
  );
  if (!rows.length) return "";
  const header = rows[0];
  const separator = header.map(() => "---");
  const bodyRows = rows.slice(1);
  return [header, separator, ...bodyRows]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

function editableText(element: HTMLElement): string {
  return (element.innerText || element.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
