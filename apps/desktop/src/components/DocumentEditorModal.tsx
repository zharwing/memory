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
import { Modal } from "./Modal.js";
import { ToggleGroup } from "./ToggleGroup.js";
import { MarkdownPreview } from "./markdown/MarkdownPreview.js";
import { isLikelyMermaidSource } from "./markdown/MermaidDiagramPreview.js";
import { formatShortDateTime } from "../utils/format.js";
import { StatusNotice } from "./AccessibleStatus.js";

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
  const [richEditorFailed, setRichEditorFailed] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const isDiagramDocument = doc.type === "diagram";
  const hasMermaidDiagram = containsMermaidDiagram(body);
  const useRenderedPreview = mode === "preview" && (isDiagramDocument || hasMermaidDiagram || richEditorFailed);
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
    setSaveFailed(false);
    setRichEditorFailed(false);
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
    setSaveFailed(false);
    try {
      const updated = await onSave({ title: title.trim(), body });
      if (!updated) {
        setSaveFailed(true);
        return;
      }
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
    } catch {
      setSaveFailed(true);
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
    <Modal
      ariaLabel={`Edit ${doc.title}`}
      backdropClassName="modal-backdrop"
      className="document-modal"
      onClose={() => void requestClose()}
      closeOnEscape={false}
    >
        <header className="document-modal-header">
          <div className="document-title-block">
            <input
              className="document-title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Document title"
              placeholder="Document title"
              required
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
        {saveFailed ? (
          <StatusNotice tone="danger" assertive title="Document not saved">
            Your changes are still in the editor. Review the current document and try again.
          </StatusNotice>
        ) : null}
        <div className="document-modal-meta">
          <KeyValue label="Updated" value={formatShortDateTime(doc.updated)} />
          <KeyValue label="Import profile" value={doc.importProfile || "none"} />
          <KeyValue label="Source" value={<code className="path-value">{doc.filePath || "memory"}</code>} />
          <KeyValue label="Imported from" value={<code className="path-value">{doc.importSourcePath || "not imported"}</code>} />
        </div>
        <div className="document-editor-toolbar">
          <ToggleGroup
            className="segmented-control compact"
            role="group"
            ariaLabel="Document editor mode"
            value={mode}
            onChange={(nextMode) => setMode(nextMode as "preview" | "markdown")}
            options={[
              { value: "preview", label: isDiagramDocument || hasMermaidDiagram ? "Rendered" : "Preview" },
              { value: "markdown", label: "Markdown" }
            ]}
          />
        </div>
        <div className="document-editor-body">
          {useRenderedPreview ? (
            <>
              {richEditorFailed && !isDiagramDocument && !hasMermaidDiagram ? (
                <StatusNotice tone="warning" title="Showing rendered preview">
                  This document contains Markdown the rich editor cannot safely import. The complete document is shown below; use the Markdown tab to edit its source.
                </StatusNotice>
              ) : null}
              <MarkdownPreview body={body} />
            </>
          ) : mode === "preview" ? (
            <MDXEditor
              key={`${doc.id}-${editorRevision}-rich-editor`}
              className="mdx-rich-editor"
              markdown={body}
              onChange={updateBodyFromRichEditor}
              onError={() => setRichEditorFailed(true)}
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
          <Modal
            title="Discard unsaved changes?"
            description={
              <p>
                You have unsaved changes in <strong>{title || doc.title}</strong>. Discard them and close this document?
              </p>
            }
            backdropClassName="dialog-backdrop"
            className="confirm-dialog"
            onClose={() => setShowDiscardDialog(false)}
            closeOnEscape={false}
            initialFocus="least-destructive"
          >
            <div className="button-row">
              <button type="button" data-dialog-cancel onClick={() => setShowDiscardDialog(false)}>Keep Editing</button>
              <button type="button" className="danger-button" onClick={confirmDiscardAndClose}>
                Discard Changes
              </button>
            </div>
          </Modal>
        ) : null}
    </Modal>
  );
}

function normalizeDocumentBody(value: string) {
  return value.replace(/\r\n/g, "\n").trimEnd();
}

function containsMermaidDiagram(value: string) {
  const trimmed = value.trim();
  return isLikelyMermaidSource(trimmed) || /(^|\n)```\s*mermaid\b/i.test(trimmed);
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
