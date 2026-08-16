export {
  areaNode,
  buildProjectGraph,
  cleanGraphSegments,
  diagramGroupFromSegments,
  importRelativePath,
  primaryAreaFromSegments,
  stripImportedProfile,
  type BuildGraphInput
} from "./index.js";
export { projectGraphDomainProjection } from "./domain-projection.js";
export { labelForSlug, normalizeGraphSlug } from "./naming.js";

/**
 * The provisional projection subpath mirrored the root package. Keep its rule
 * exports until consumers can migrate to the dedicated `./rules` subpath.
 */
export {
  normalizeGraphExtractionRule,
  normalizeGraphExtractionRules,
  parseGraphExtractionRules
} from "./rules.js";
