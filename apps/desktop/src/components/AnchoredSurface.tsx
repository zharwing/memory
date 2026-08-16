import {
  type AriaRole,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef
} from "react";
import { useLayerStack } from "./LayerProvider.js";

export interface AnchoredSurfaceState {
  readonly controlsId: string;
  readonly expanded: boolean;
}

export interface AnchoredSurfaceProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly className?: string;
  readonly surfaceClassName: string;
  readonly surfaceRole?: AriaRole;
  readonly ariaLabel: string;
  readonly anchor: (state: AnchoredSurfaceState) => ReactNode;
  readonly children: ReactNode;
}

/**
 * In-place menu/popover owner. Only the topmost registered layer responds to
 * Escape or an outside primary-pointer press, and dismissal restores focus to
 * the control that opened the surface.
 */
export function AnchoredSurface({
  open,
  onClose,
  className,
  surfaceClassName,
  surfaceRole = "dialog",
  ariaLabel,
  anchor,
  children
}: AnchoredSurfaceProps) {
  const layerStack = useLayerStack();
  const instanceId = useId();
  const controlsId = `${instanceId}-surface`;
  const rootRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const activeElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    returnFocusRef.current = activeElement && root?.contains(activeElement)
      ? activeElement
      : root?.querySelector<HTMLElement>("[aria-controls]") ?? null;
    layerStack.push(instanceId);

    return () => {
      layerStack.remove(instanceId);
      const returnTarget = returnFocusRef.current;
      if (returnTarget?.isConnected && !returnTarget.inert) {
        returnTarget.focus({ preventScroll: true });
      }
    };
  }, [instanceId, layerStack, open]);

  useEffect(() => {
    if (!open) return;

    function dismissTopmost(event: KeyboardEvent | PointerEvent) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onCloseRef.current();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!layerStack.isTop(instanceId)) return;
      dismissTopmost(event);
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0 || event.defaultPrevented) return;
      if (!layerStack.isTop(instanceId)) return;
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node) || root.contains(event.target)) return;
      dismissTopmost(event);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [instanceId, layerStack, open]);

  return (
    <div ref={rootRef} className={className}>
      {anchor({ controlsId, expanded: open })}
      {open ? (
        <div
          id={controlsId}
          className={surfaceClassName}
          role={surfaceRole}
          aria-label={ariaLabel}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
