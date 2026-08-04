import { type Dispatch, type SetStateAction, useState } from "react";
import { numberOrUndefined } from "../../utils/format.js";

/**
 * Canonical AI-run draft shared by DocsScreen (link discovery) and
 * GraphScreen (relationship review). The timeout is held in seconds and
 * converted to `timeoutMs` at the submit boundary, so both screens send the
 * same payload shape to `store.semantic.analyze`.
 */
export const SEMANTIC_RUN_DRAFT_DEFAULTS = {
  mode: "review",
  endpoint: "",
  model: "",
  apiKey: "",
  maxDocuments: "",
  maxCandidates: "",
  maxCandidatesPerDocument: "8",
  timeoutSeconds: "120",
  maxOutputTokens: "1024",
  jsonMode: true
};

export type SemanticRunDraft = typeof SEMANTIC_RUN_DRAFT_DEFAULTS;

export interface SemanticRunPayloadOptions {
  /** Scope forwarded verbatim; screens own their scope semantics. */
  scope?: Record<string, unknown>;
  /** Mode used when the draft mode is somehow empty. */
  fallbackMode?: string;
}

export function semanticRunPayload(
  draft: SemanticRunDraft,
  options: SemanticRunPayloadOptions = {}
): Record<string, unknown> {
  const mode = draft.mode || options.fallbackMode || "review";
  const timeoutSeconds = numberOrUndefined(draft.timeoutSeconds);
  return {
    mode,
    dryRun: mode === "dry-run",
    ...(options.scope !== undefined ? { scope: options.scope } : {}),
    endpoint: draft.endpoint.trim() || undefined,
    model: draft.model.trim() || undefined,
    apiKey: draft.apiKey.trim() || undefined,
    maxDocuments: numberOrUndefined(draft.maxDocuments),
    maxCandidates: numberOrUndefined(draft.maxCandidates),
    maxCandidatesPerDocument: numberOrUndefined(draft.maxCandidatesPerDocument),
    timeoutMs: timeoutSeconds ? timeoutSeconds * 1000 : undefined,
    maxOutputTokens: numberOrUndefined(draft.maxOutputTokens),
    jsonMode: Boolean(draft.jsonMode)
  };
}

export interface SemanticRunDraftApi<Extra extends Record<string, unknown>> {
  draft: SemanticRunDraft & Extra;
  patchDraft: (patch: Partial<SemanticRunDraft & Extra>) => void;
  resetDraft: () => void;
  setDraft: Dispatch<SetStateAction<SemanticRunDraft & Extra>>;
  toPayload: (options?: SemanticRunPayloadOptions) => Record<string, unknown>;
}

export function useSemanticRunDraft<Extra extends Record<string, unknown> = Record<never, never>>(
  extras?: Extra
): SemanticRunDraftApi<Extra> {
  type Draft = SemanticRunDraft & Extra;
  const [draft, setDraft] = useState<Draft>(() => ({ ...SEMANTIC_RUN_DRAFT_DEFAULTS, ...extras } as Draft));

  function patchDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function resetDraft() {
    setDraft({ ...SEMANTIC_RUN_DRAFT_DEFAULTS, ...extras } as Draft);
  }

  return {
    draft,
    patchDraft,
    resetDraft,
    setDraft,
    toPayload: (options?: SemanticRunPayloadOptions) => semanticRunPayload(draft, options)
  };
}
