import type { Plugin } from "vite";

const MERMAID_CORE_SUFFIX = "/mermaid/dist/mermaid.core.mjs";

// Mermaid's browser entry registers every stable, beta, and experimental
// diagram loader. Rollup must then retain a production chunk for each loader,
// even though the editor only offers the diagram families below. Keep the
// exact Mermaid renderers for those product-supported families while allowing
// Rollup to remove unreachable loaders and their transitive layout engines.
const SUPPORTED_DIAGRAM_REGISTRATION = `  registerLazyLoadedDiagrams(
    detector_default4,
    classDetector_V2_default,
    classDetector_default,
    erDetector_default,
    ganttDetector_default,
    sequenceDetector_default,
    flowDetector_v2_default,
    flowDetector_default,
    detector_default3,
    stateDetector_V2_default,
    stateDetector_default,
    journeyDetector_default
  );
`;

const REGISTRATION_START = "  if (true) {\n    registerLazyLoadedDiagrams(";
const ADD_DIAGRAMS_END = "}, \"addDiagrams\");";
const PUBLIC_API_START = "var mermaid = {\n  startOnLoad: true,";
const PUBLIC_API_END = "var mermaid_default = mermaid;";
const PRODUCT_PUBLIC_API = `var mermaid = {
  render: render2,
  initialize: initialize2,
  parseError: void 0
};
`;
const MERMAID_LAYOUT_SUFFIX = "/mermaid/dist/chunks/mermaid.core/chunk-J7OUQ5F2.mjs";
const DEFAULT_LAYOUT_START = "var registerDefaultLayoutLoaders = /* @__PURE__ */ __name(() => {";
const DEFAULT_LAYOUT_END = "}, \"registerDefaultLayoutLoaders\");";
const DAGRE_LAYOUT_REGISTRATION = `var registerDefaultLayoutLoaders = /* @__PURE__ */ __name(() => {
  registerLayoutLoaders([
    {
      name: "dagre",
      loader: /* @__PURE__ */ __name(async () => await import("./dagre-VZM6K2ZE.mjs"), "loader")
    }
  ]);
`;

/**
 * Creates a selective Mermaid build from Mermaid's official ESM core.
 *
 * Mermaid does not currently expose a browser entry that omits unregistered
 * built-in diagram loaders. This build-time transform changes only the loader
 * registration block; parsing, rendering, sanitization, and lazy loading still
 * come from the installed Mermaid package. The strict anchors intentionally
 * fail the build if a Mermaid update changes that internal boundary so an
 * upgrade cannot silently ship an incomplete renderer.
 */
export function selectiveMermaidDiagrams(): Plugin {
  return {
    name: "zharwing:selective-mermaid-diagrams",
    enforce: "pre",
    transform(source, id) {
      const cleanId = id.split("?", 1)[0]?.replaceAll("\\", "/");
      if (cleanId?.endsWith(MERMAID_LAYOUT_SUFFIX)) {
        const defaultLayoutStart = source.indexOf(DEFAULT_LAYOUT_START);
        const defaultLayoutEnd = source.indexOf(DEFAULT_LAYOUT_END, defaultLayoutStart);
        if (defaultLayoutStart < 0 || defaultLayoutEnd < 0) {
          throw new Error(
            "The installed Mermaid layout registry no longer matches the selective-loader boundary. " +
            "Review Mermaid's default layout loaders before upgrading."
          );
        }
        return {
          code:
            source.slice(0, defaultLayoutStart) +
            DAGRE_LAYOUT_REGISTRATION +
            source.slice(defaultLayoutEnd),
          map: null
        };
      }
      if (!cleanId?.endsWith(MERMAID_CORE_SUFFIX)) return null;

      const registrationStart = source.indexOf(REGISTRATION_START);
      const registrationEnd = source.indexOf(ADD_DIAGRAMS_END, registrationStart);
      if (registrationStart < 0 || registrationEnd < 0) {
        throw new Error(
          "The installed Mermaid core no longer matches the selective-loader boundary. " +
          "Review Mermaid's addDiagrams implementation before upgrading."
        );
      }
      if (source.indexOf(REGISTRATION_START, registrationStart + 1) >= 0) {
        throw new Error("Mermaid core contains more than one built-in diagram registration block.");
      }

      const selectiveSource =
          source.slice(0, registrationStart) +
          SUPPORTED_DIAGRAM_REGISTRATION +
          source.slice(registrationEnd);
      const publicApiStart = selectiveSource.indexOf(PUBLIC_API_START);
      const publicApiEnd = selectiveSource.indexOf(PUBLIC_API_END, publicApiStart);
      if (publicApiStart < 0 || publicApiEnd < 0) {
        throw new Error(
          "The installed Mermaid core no longer matches the product API boundary. " +
          "Review Mermaid's default export before upgrading."
        );
      }

      return {
        code:
          selectiveSource.slice(0, publicApiStart) +
          PRODUCT_PUBLIC_API +
          selectiveSource.slice(publicApiEnd),
        map: null
      };
    }
  };
}
