import {
  createContext,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

interface DialogStackRegistry {
  readonly push: (instanceId: string) => void;
  readonly remove: (instanceId: string) => void;
  readonly isTop: (instanceId: string) => boolean;
}

const DialogStackContext = createContext<DialogStackRegistry | null>(null);

/**
 * Owns dialog ordering for one mounted application runtime. Keeping the stack
 * in React ownership prevents multiple app roots, previews, or tests from
 * sharing hidden module state.
 */
export function DialogStackProvider({ children }: { children: ReactNode }) {
  const stackRef = useRef<string[]>([]);
  const registryRef = useRef<DialogStackRegistry | null>(null);
  if (!registryRef.current) {
    registryRef.current = {
      push(instanceId) {
        stackRef.current.push(instanceId);
      },
      remove(instanceId) {
        const index = stackRef.current.lastIndexOf(instanceId);
        if (index >= 0) stackRef.current.splice(index, 1);
      },
      isTop(instanceId) {
        return stackRef.current.at(-1) === instanceId;
      }
    };
  }
  return (
    <DialogStackContext.Provider value={registryRef.current}>
      {children}
    </DialogStackContext.Provider>
  );
}

interface DialogProps {
  ariaLabel?: string;
  title?: ReactNode;
  description?: ReactNode;
  backdropClassName: string;
  className: string;
  onClose: () => void;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  initialFocus?: "first" | "least-destructive" | "dialog";
  children: ReactNode;
}

/**
 * Project-owned modal dialog contract.
 *
 * The dialog is portalled beside the application root so the background can
 * be made inert. It owns initial focus, Tab containment, topmost-only Escape,
 * nested-dialog isolation, and focus restoration.
 */
export function Dialog({
  ariaLabel,
  title,
  description,
  backdropClassName,
  className,
  onClose,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  initialFocus = "first",
  children
}: DialogProps) {
  const dialogStack = useContext(DialogStackContext);
  if (!dialogStack) {
    throw new Error("DialogStackProvider is missing.");
  }
  const ownedDialogStack = dialogStack;
  const instanceId = useId();
  const titleId = `${instanceId}-title`;
  const descriptionId = `${instanceId}-description`;
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!backdrop || !panel) return;

    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    ownedDialogStack.push(instanceId);

    const background = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== backdrop)
      .map((element) => ({
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden")
      }));
    for (const state of background) {
      state.element.inert = true;
      state.element.setAttribute("aria-hidden", "true");
    }

    const candidate = initialFocus === "dialog"
      ? panel
      : initialFocus === "least-destructive"
        ? panel.querySelector<HTMLElement>("[data-dialog-cancel]") ?? firstFocusable(panel)
        : panel.querySelector<HTMLElement>("[data-dialog-initial-focus]") ?? firstFocusable(panel);
    (candidate ?? panel).focus({ preventScroll: true });

    return () => {
      ownedDialogStack.remove(instanceId);
      for (const state of background) {
        state.element.inert = state.inert;
        if (state.ariaHidden === null) state.element.removeAttribute("aria-hidden");
        else state.element.setAttribute("aria-hidden", state.ariaHidden);
      }
      const returnTarget = returnFocusRef.current;
      if (returnTarget?.isConnected && !returnTarget.inert) {
        returnTarget.focus({ preventScroll: true });
      }
    };
  }, [ownedDialogStack, initialFocus, instanceId]);

  useEffect(() => {
    if (!closeOnEscape) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!ownedDialogStack.isTop(instanceId)) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeOnEscape, ownedDialogStack, instanceId, onClose]);

  function containFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !ownedDialogStack.isTop(instanceId)) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = focusableElements(panel);
    if (!focusable.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      ref={backdropRef}
      className={backdropClassName}
      role="presentation"
      onMouseDown={closeOnBackdropClick
        ? (event) => {
            if (event.target === event.currentTarget && ownedDialogStack.isTop(instanceId)) onClose();
          }
        : undefined}
    >
      <section
        ref={panelRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : ariaLabel}
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={containFocus}
      >
        {title ? <h2 id={titleId} className="dialog-title">{title}</h2> : null}
        {description ? <div id={descriptionId} className="dialog-description">{description}</div> : null}
        {children}
      </section>
    </div>,
    document.body
  );
}

/** Backward-compatible name while existing call sites migrate to Dialog. */
export const Modal = Dialog;

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function firstFocusable(container: HTMLElement): HTMLElement | null {
  return focusableElements(container)[0] ?? null;
}
