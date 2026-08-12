import { useState } from "react";
import { Dialog } from "./Modal.js";
import { StatusNotice } from "./AccessibleStatus.js";

export function ConfirmDeleteButton({
  itemType,
  title,
  label,
  critical,
  permanent,
  disabled,
  onConfirm
}: {
  itemType: string;
  title: string;
  label: string;
  critical?: boolean;
  permanent?: boolean;
  disabled?: boolean;
  onConfirm: () => Promise<unknown> | unknown;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [operationFailed, setOperationFailed] = useState(false);
  const actionText = permanent ? "permanently delete" : "move to trash";

  async function runDelete() {
    await onConfirm();
  }

  async function handleClick() {
    if (disabled) return;
    setOperationFailed(false);
    setOpen(true);
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setOperationFailed(false);
    try {
      await runDelete();
      setOpen(false);
    } catch {
      setOperationFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={permanent ? "danger-button" : undefined} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => void handleClick()}>
        {label}
      </button>
      {open ? (
        <Dialog
          title={permanent ? "Delete permanently?" : critical ? "Move critical item to Trash?" : "Move to Trash?"}
          description={<p>This will {actionText} <strong>{title}</strong>.{permanent ? " This cannot be undone." : " You can restore it later from Trash."}</p>}
          backdropClassName="dialog-backdrop"
          className="confirm-dialog"
          onClose={() => { if (!busy) setOpen(false); }}
          closeOnBackdropClick={false}
          initialFocus="least-destructive"
        >
          {operationFailed ? <StatusNotice tone="danger" assertive title="Action not completed">The item was not changed. Review its latest state and try again.</StatusNotice> : null}
          <div className="button-row">
            <button type="button" data-dialog-cancel disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className={permanent ? "danger-button" : undefined} disabled={busy} aria-busy={busy} onClick={() => void confirm()}>
              {busy ? "Working…" : label}
            </button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
