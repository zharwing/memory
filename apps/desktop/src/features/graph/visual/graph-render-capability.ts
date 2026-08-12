export type GraphRenderCapability =
  | { available: true }
  | { available: false; reason: "dom" | "measurement" | "animation" | "svg" };

export function graphRenderCapability(): GraphRenderCapability {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return { available: false, reason: "dom" };
  }
  if (typeof ResizeObserver === "undefined") {
    return { available: false, reason: "measurement" };
  }
  if (typeof requestAnimationFrame !== "function" || typeof cancelAnimationFrame !== "function") {
    return { available: false, reason: "animation" };
  }
  if (typeof SVGSVGElement === "undefined") {
    return { available: false, reason: "svg" };
  }
  return { available: true };
}
