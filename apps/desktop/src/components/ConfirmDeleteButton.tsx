import { useState } from "react";
import { Modal } from "./Modal.js";
import { readString, writeString } from "../utils/storage.js";

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
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const preferenceKey = `aimem.delete.confirm.skip.${itemType}`;
  const actionText = permanent ? "permanently delete" : "move to trash";

  async function runDelete() {
    await onConfirm();
  }

  async function handleClick() {
    if (disabled) return;
    if (readString(preferenceKey) === "true") {
      await runDelete();
      return;
    }
    setOpen(true);
  }

  async function confirm() {
    if (dontAskAgain) writeString(preferenceKey, "true");
    setOpen(false);
    setDontAskAgain(false);
    await runDelete();
  }

  return (
    <>
      <button type="button" className={permanent ? "danger-button" : undefined} disabled={disabled} onClick={() => void handleClick()}>
        {label}
      </button>
      {open ? (
        <Modal
          ariaLabel={`Confirm ${label}`}
          backdropClassName="dialog-backdrop"
          className="confirm-dialog"
          onClose={() => setOpen(false)}
          closeOnBackdropClick={false}
        >
          <h3>{permanent ? "Delete Permanently?" : critical ? "Move Critical Item to Trash?" : "Move to Trash?"}</h3>
          <p>
            This will {actionText} <strong>{title}</strong>.
            {permanent ? " This cannot be undone." : " You can restore it later from Trash."}
          </p>
          <label className="checkbox-row">
            <input type="checkbox" checked={dontAskAgain} onChange={(event) => setDontAskAgain(event.target.checked)} />
            <span>Do not ask again for this type of item</span>
          </label>
          <div className="button-row">
            <button type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className={permanent ? "danger-button" : undefined} onClick={() => void confirm()}>
              {label}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
