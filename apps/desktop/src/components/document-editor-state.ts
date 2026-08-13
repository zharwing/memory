import type { MemoryDocument } from "@zharwing/memory-core";

export type DocumentEditorMode = "preview" | "markdown";

export interface DocumentEditorState {
  readonly mode: DocumentEditorMode;
  readonly title: string;
  readonly body: string;
  readonly savedTitle: string;
  readonly savedBody: string;
  readonly showDiscardDialog: boolean;
  readonly editorRevision: number;
  readonly richEditorFailed: boolean;
  readonly localSaving: boolean;
  readonly saveFailed: boolean;
}

export type DocumentEditorAction =
  | { readonly type: "reset-document"; readonly doc: MemoryDocument }
  | { readonly type: "change-mode"; readonly mode: DocumentEditorMode }
  | { readonly type: "change-title"; readonly title: string }
  | { readonly type: "change-body"; readonly body: string }
  | {
      readonly type: "change-rich-body";
      readonly body: string;
      readonly initialMarkdownNormalize: boolean;
    }
  | { readonly type: "open-discard-dialog" }
  | { readonly type: "close-discard-dialog" }
  | { readonly type: "discard-changes" }
  | { readonly type: "rich-editor-failed" }
  | { readonly type: "save-started" }
  | { readonly type: "save-failed" }
  | { readonly type: "save-finished" }
  | {
      readonly type: "save-succeeded";
      readonly title: string;
      readonly body: string;
      readonly resetEditor: boolean;
    };

export function createDocumentEditorState(doc: MemoryDocument): DocumentEditorState {
  const title = doc.title || "";
  const body = doc.body || "";
  return {
    mode: "preview",
    title,
    body,
    savedTitle: title,
    savedBody: body,
    showDiscardDialog: false,
    editorRevision: 0,
    richEditorFailed: false,
    localSaving: false,
    saveFailed: false
  };
}

export function documentEditorReducer(
  state: DocumentEditorState,
  action: DocumentEditorAction
): DocumentEditorState {
  switch (action.type) {
    case "reset-document": {
      const reset = createDocumentEditorState(action.doc);
      return { ...reset, editorRevision: state.editorRevision + 1 };
    }
    case "change-mode":
      return { ...state, mode: action.mode };
    case "change-title":
      return { ...state, title: action.title };
    case "change-body":
      return { ...state, body: action.body };
    case "change-rich-body": {
      const bodyWasClean = normalizeDocumentBody(state.body) === normalizeDocumentBody(state.savedBody);
      if (action.initialMarkdownNormalize && state.title === state.savedTitle && bodyWasClean) {
        return { ...state, body: action.body, savedBody: action.body };
      }
      return { ...state, body: action.body };
    }
    case "open-discard-dialog":
      return { ...state, showDiscardDialog: true };
    case "close-discard-dialog":
      return { ...state, showDiscardDialog: false };
    case "discard-changes":
      return {
        ...state,
        mode: "preview",
        title: state.savedTitle,
        body: state.savedBody,
        showDiscardDialog: false,
        editorRevision: state.editorRevision + 1
      };
    case "rich-editor-failed":
      return { ...state, richEditorFailed: true };
    case "save-started":
      return { ...state, localSaving: true, saveFailed: false };
    case "save-failed":
      return { ...state, saveFailed: true };
    case "save-finished":
      return { ...state, localSaving: false };
    case "save-succeeded":
      return {
        ...state,
        title: action.title,
        body: action.body,
        savedTitle: action.title,
        savedBody: action.body,
        showDiscardDialog: false,
        editorRevision: state.editorRevision + (action.resetEditor ? 1 : 0)
      };
  }
}

export function normalizeDocumentBody(value: string): string {
  return value.replace(/\r\n/g, "\n").trimEnd();
}
