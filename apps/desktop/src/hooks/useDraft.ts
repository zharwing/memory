import { type Dispatch, type SetStateAction, useState } from "react";

/**
 * Small helper for the common form-draft pattern:
 * `setDraft((current) => ({ ...current, ...patch }))`.
 * Returns `[draft, patch, setDraft]`; use `setDraft` directly for
 * functional updates that depend on the previous draft.
 */
export function useDraft<T extends object>(
  initial: T | (() => T)
): [T, (patch: Partial<T>) => void, Dispatch<SetStateAction<T>>] {
  const [draft, setDraft] = useState<T>(initial);

  function patchDraft(patch: Partial<T>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  return [draft, patchDraft, setDraft];
}
