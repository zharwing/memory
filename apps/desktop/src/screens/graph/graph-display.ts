/**
 * Stable compatibility surface for existing graph consumers. Feature modules
 * import the owned leaf modules directly so this barrel never participates in
 * an internal dependency cycle.
 */
export * from "./graph-display-types.js";
export * from "./graph-projection.js";
export * from "./graph-selection.js";
export * from "./graph-presentation.js";
