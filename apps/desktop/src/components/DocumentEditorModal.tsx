import { useEffect, useState } from "react";
import {
  BoldItalicUnderlineToggles,
  CreateLink,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  Separator,
  SingleChoiceToggleGroup,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  convertSelectionToNode$,
  currentBlockType$,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  useCellValue,
  usePublisher
} from "@mdxeditor/editor";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $createParagraphNode } from "lexical";
import "@mdxeditor/editor/style.css";
import { KeyValue } from "./layout.js";
import { ConfirmDeleteButton } from "./ConfirmDeleteButton.js";

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
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [localSaving, setLocalSaving] = useState(false);
  const dirty = title !== savedTitle || normalizeDocumentBody(body) !== normalizeDocumentBody(savedBody);
  const saveInProgress = saving || localSaving;

  useEffect(() => {
    setMode("preview");
    setTitle(doc.title || "");
    setBody(doc.body || "");
    setSavedTitle(doc.title || "");
    setSavedBody(doc.body || "");
    setShowDiscardDialog(false);
    setLocalSaving(false);
    setEditorRevision((revision) => revision + 1);
  }, [doc.id]);

  function discardLocalChanges() {
    setMode("preview");
    setTitle(savedTitle);
    setBody(savedBody);
    setShowDiscardDialog(false);
    setEditorRevision((revision) => revision + 1);
  }

  function requestClose() {
    if (dirty) {
      setShowDiscardDialog(true);
      return;
    }
    onClose();
  }

  function confirmDiscardAndClose() {
    discardLocalChanges();
    onClose();
  }

  function updateBodyFromRichEditor(nextBody: string, initialMarkdownNormalize: boolean) {
    const bodyWasClean = normalizeDocumentBody(body) === normalizeDocumentBody(savedBody);
    if (initialMarkdownNormalize && title === savedTitle && bodyWasClean) {
      setBody(nextBody);
      setSavedBody(nextBody);
      return;
    }
    setBody(nextBody);
  }

  async function saveDocument() {
    if (!title.trim() || saveInProgress) return;
    setLocalSaving(true);
    try {
      const updated = await onSave({ title: title.trim(), body });
      if (!updated) return;
      const nextTitle = updated.title || title.trim();
      const nextBody = typeof updated.body === "string" ? updated.body : body;
      const shouldResetEditor = nextBody !== body;
      setTitle(nextTitle);
      setBody(nextBody);
      setSavedTitle(nextTitle);
      setSavedBody(nextBody);
      setShowDiscardDialog(false);
      if (shouldResetEditor) {
        setEditorRevision((revision) => revision + 1);
      }
    } finally {
      setLocalSaving(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        event.preventDefault();
        if (showDiscardDialog) {
          setShowDiscardDialog(false);
          return;
        }
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
            <button type="button" disabled={!dirty || saveInProgress || !title.trim()} onClick={() => void saveDocument()}>
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
            <button type="button" className={mode === "preview" ? "selected" : ""} onClick={() => setMode("preview")}>
              Preview
            </button>
            <button type="button" className={mode === "markdown" ? "selected" : ""} onClick={() => setMode("markdown")}>
              Markdown
            </button>
          </div>
        </div>
        <div className="document-editor-body">
          {mode === "preview" ? (
            <MDXEditor
              key={`${doc.id}-${editorRevision}-rich-editor`}
              className="mdx-rich-editor"
              markdown={body}
              onChange={updateBodyFromRichEditor}
              plugins={markdownEditorPlugins}
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
        {showDiscardDialog ? (
          <div
            className="dialog-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowDiscardDialog(false);
            }}
          >
            <div className="confirm-dialog" role="dialog" aria-modal="true" aria-label="Discard document changes">
              <h3>Discard Unsaved Changes?</h3>
              <p>
                You have unsaved changes in <strong>{title || doc.title}</strong>. Discard them and close this document?
              </p>
              <div className="button-row">
                <button type="button" onClick={() => setShowDiscardDialog(false)}>Keep Editing</button>
                <button type="button" className="danger-button" onClick={confirmDiscardAndClose}>
                  Discard Changes
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function normalizeDocumentBody(value: string) {
  return value.replace(/\r\n/g, "\n").trimEnd();
}

const markdownEditorPlugins = [
  headingsPlugin(),
  listsPlugin(),
  quotePlugin(),
  thematicBreakPlugin(),
  linkPlugin(),
  linkDialogPlugin(),
  tablePlugin(),
  codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
  codeMirrorPlugin({
    codeBlockLanguages: {
      js: "JavaScript",
      jsx: "JavaScript React",
      ts: "TypeScript",
      tsx: "TypeScript React",
      json: "JSON",
      markdown: "Markdown",
      mermaid: "Mermaid",
      txt: "Text"
    }
  }),
  markdownShortcutPlugin(),
  toolbarPlugin({
    toolbarContents: () => (
      <>
        <UndoRedo />
        <BlockTypeToggles />
        <Separator />
        <BoldItalicUnderlineToggles />
        <ListsToggle />
        <CreateLink />
        <InsertTable />
        <InsertCodeBlock />
        <InsertThematicBreak />
      </>
    )
  })
];

type ToolbarBlockType = "paragraph" | "h1" | "h2" | "h3" | "quote";

const blockTypeItems: Array<{ title: string; value: ToolbarBlockType; contents: string }> = [
  { title: "Paragraph", value: "paragraph", contents: "P" },
  { title: "Heading 1", value: "h1", contents: "H1" },
  { title: "Heading 2", value: "h2", contents: "H2" },
  { title: "Heading 3", value: "h3", contents: "H3" },
  { title: "Quote", value: "quote", contents: "Q" }
];

function BlockTypeToggles() {
  const currentBlockType = useCellValue(currentBlockType$);
  const convertSelectionToNode = usePublisher(convertSelectionToNode$);
  const selectedBlockType = blockTypeItems.some((item) => item.value === currentBlockType)
    ? (currentBlockType as ToolbarBlockType)
    : "";

  function applyBlockType(blockType: ToolbarBlockType | "") {
    switch (blockType) {
      case "paragraph":
        convertSelectionToNode(() => $createParagraphNode());
        break;
      case "quote":
        convertSelectionToNode(() => $createQuoteNode());
        break;
      case "h1":
      case "h2":
      case "h3":
        convertSelectionToNode(() => $createHeadingNode(blockType));
        break;
      case "":
        break;
    }
  }

  return (
    <SingleChoiceToggleGroup
      value={selectedBlockType}
      onChange={applyBlockType}
      items={blockTypeItems.map((item) => ({
        ...item,
        contents: <span className="mdx-block-toggle-label">{item.contents}</span>
      }))}
    />
  );
}
