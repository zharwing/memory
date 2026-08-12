import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";
import { graphiteCopperLight } from "@zharwing/memory-theme";
import { Modal } from "../Modal.js";
import { hashString } from "../../utils/format.js";
import { IconButton } from "../IconButton.js";
import { LoadingStatus } from "../AccessibleStatus.js";

export const SUPPORTED_MERMAID_DIAGRAMS = [
  "flowchart and graph",
  "sequence",
  "class",
  "state",
  "entity-relationship",
  "Gantt",
  "journey",
  "mind map",
  "timeline"
] as const;

const SUPPORTED_MERMAID_PATTERN = /^(flowchart(?!-elk\b)|graph|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|gantt|journey|mindmap|timeline)\b/;
const UNSUPPORTED_MERMAID_MESSAGE =
  `Supported Mermaid diagram families are ${SUPPORTED_MERMAID_DIAGRAMS.join(", ")}. ` +
  "This source remains available in Markdown mode.";

export function isLikelyMermaidSource(source: string) {
  return SUPPORTED_MERMAID_PATTERN.test(source.trimStart());
}

export function MermaidDiagramPreview({ source }: { source: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const isSupported = isLikelyMermaidSource(source);

  useEffect(() => {
    setViewerOpen(false);
  }, [source]);

  useEffect(() => {
    if (!isSupported) {
      setSvg("");
      setError("");
      return;
    }

    let cancelled = false;

    async function renderDiagram() {
      setSvg("");
      setError("");
      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;
        const styles = getComputedStyle(document.documentElement);
        const color = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: "transparent",
            primaryColor: color("--surface", graphiteCopperLight.surface),
            primaryTextColor: color("--text", graphiteCopperLight.text),
            primaryBorderColor: color("--border", graphiteCopperLight.border),
            lineColor: color("--accent", graphiteCopperLight.accent),
            secondaryColor: color("--surface-2", graphiteCopperLight.surface2),
            tertiaryColor: color("--background", graphiteCopperLight.background)
          }
        });
        const result = await mermaid.render(`zharwing-mermaid-${Math.abs(hashString(source))}-${Date.now()}`, source);
        if (!cancelled) setSvg(result.svg);
      } catch {
        if (!cancelled) setError("Diagram preview is unavailable for this content.");
      }
    }

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [isSupported, source]);

  const visibleSvg = isSupported ? svg : "";
  const visibleError = isSupported ? error : UNSUPPORTED_MERMAID_MESSAGE;

  return (
    <div className="diagram-preview mermaid-preview">
      {visibleSvg ? (
        <IconButton
          className="diagram-open-button"
          onClick={() => setViewerOpen(true)}
          label="Open diagram larger"
        >
          <Maximize2 size={16} aria-hidden="true" />
        </IconButton>
      ) : null}
      <div className="diagram-preview-canvas">
        {visibleSvg ? (
          <MermaidSvgMarkup svg={visibleSvg} />
        ) : visibleError ? (
          <div className="mermaid-error" role="alert">
            <strong>Mermaid could not render this diagram.</strong>
            <p>{visibleError}</p>
          </div>
        ) : (
          <div className="diagram-loading"><LoadingStatus label="Rendering diagram…" /></div>
        )}
      </div>
      {viewerOpen && visibleSvg ? <DiagramFullscreenViewer svg={visibleSvg} onClose={() => setViewerOpen(false)} /> : null}
    </div>
  );
}

function MermaidSvgMarkup({ svg, zoom = 1 }: { svg: string; zoom?: number }) {
  return (
    <div
      className="mermaid-svg"
      style={{ "--diagram-svg-width": `${Math.round(zoom * 100)}%` } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function DiagramFullscreenViewer({ svg, onClose }: { svg: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1.25);
  const [isPanning, setIsPanning] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const zoomPercent = Math.round(zoom * 100);

  function zoomOut() {
    setZoom((current) => Math.max(0.5, Number((current - 0.25).toFixed(2))));
  }

  function zoomIn() {
    setZoom((current) => Math.min(3, Number((current + 0.25).toFixed(2))));
  }

  function beginPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const canvas = event.currentTarget;
    const canScroll = canvas.scrollWidth > canvas.clientWidth || canvas.scrollHeight > canvas.clientHeight;
    if (!canScroll) return;

    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop
    };
    canvas.setPointerCapture(event.pointerId);
    setIsPanning(true);
    event.preventDefault();
  }

  function updatePan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const canvas = event.currentTarget;
    canvas.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    canvas.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
    event.preventDefault();
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panStateRef.current = null;
    setIsPanning(false);
    event.preventDefault();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        zoomIn();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "-") {
        event.preventDefault();
        zoomOut();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "0") {
        event.preventDefault();
        setZoom(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  useEffect(() => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) return;
    const canvasElement: HTMLDivElement = currentCanvas;

    function handleWheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        setZoom((current) => {
          const next = current + (event.deltaY < 0 ? 0.25 : -0.25);
          return Math.min(3, Math.max(0.5, Number(next.toFixed(2))));
        });
        return;
      }

      if (event.shiftKey && event.deltaY !== 0) {
        if (canvasElement.scrollWidth <= canvasElement.clientWidth) return;
        event.preventDefault();
        event.stopPropagation();
        canvasElement.scrollLeft += event.deltaY;
      }
    }

    canvasElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvasElement.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <Modal
      ariaLabel="Diagram preview"
      backdropClassName="diagram-viewer-backdrop"
      className="diagram-viewer"
      onClose={onClose}
      closeOnEscape={false}
    >
        <header className="diagram-viewer-header">
          <div className="diagram-viewer-title">
            <h3>Diagram preview</h3>
            <span>{zoomPercent}%</span>
          </div>
          <div className="diagram-viewer-controls">
            <IconButton className="icon-only" onClick={zoomOut} label="Zoom out">
              <Minus size={16} aria-hidden="true" />
            </IconButton>
            <IconButton className="icon-only" onClick={() => setZoom(1)} label="Reset zoom">
              <RotateCcw size={16} aria-hidden="true" />
            </IconButton>
            <IconButton className="icon-only" onClick={zoomIn} label="Zoom in">
              <Plus size={16} aria-hidden="true" />
            </IconButton>
            <IconButton className="icon-only" onClick={onClose} label="Close diagram preview">
              <X size={16} aria-hidden="true" />
            </IconButton>
          </div>
        </header>
        <div
          className={`diagram-viewer-canvas ${isPanning ? "panning" : ""}`}
          ref={canvasRef}
          role="region"
          aria-label="Scrollable diagram canvas"
          tabIndex={0}
          onPointerDown={beginPan}
          onPointerMove={updatePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onLostPointerCapture={() => {
            panStateRef.current = null;
            setIsPanning(false);
          }}
        >
          <MermaidSvgMarkup svg={svg} zoom={zoom} />
        </div>
    </Modal>
  );
}
