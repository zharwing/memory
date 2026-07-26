import { type ReactNode, useEffect } from "react";

/**
 * Shared dialog primitive: fixed backdrop, click-outside-to-close (on the
 * backdrop itself only), Escape-to-close, and `role="dialog"` semantics.
 *
 * Sizing/skin comes from the caller via `backdropClassName` (e.g.
 * `modal-backdrop`, `dialog-backdrop`, `diagram-viewer-backdrop`) and
 * `className` for the panel (e.g. `confirm-dialog`, `document-modal`).
 * Dialogs that implement their own keyboard handling (document editor,
 * diagram viewer) pass `closeOnEscape={false}`.
 */
export function Modal({
  ariaLabel,
  backdropClassName,
  className,
  onClose,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  children
}: {
  ariaLabel: string;
  backdropClassName: string;
  className: string;
  onClose: () => void;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!closeOnEscape) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeOnEscape, onClose]);

  return (
    <div
      className={backdropClassName}
      role="presentation"
      onMouseDown={closeOnBackdropClick
        ? (event) => {
            if (event.target === event.currentTarget) onClose();
          }
        : undefined}
    >
      <section className={className} role="dialog" aria-modal="true" aria-label={ariaLabel}>
        {children}
      </section>
    </div>
  );
}
