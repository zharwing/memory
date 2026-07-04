import { useState } from "react";

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
    if (localStorage.getItem(preferenceKey) === "true") {
      await runDelete();
      return;
    }
    setOpen(true);
  }

  async function confirm() {
    if (dontAskAgain) localStorage.setItem(preferenceKey, "true");
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
        <div className="dialog-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-label={`Confirm ${label}`}>
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
          </div>
        </div>
      ) : null}
    </>
  );
}
