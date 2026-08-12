# Route and Graph Accessibility Contract

This document describes the source contract implemented by MEM-FEV2-07. It is
an implementation reference, not a claim that manual assistive-technology or
packaged-WebView qualification has passed.

## Route ownership

`apps/desktop/src/app/routing/route-registry.ts` is the only route authority.
The registry owns canonical and compatibility paths, route IDs, screen IDs,
redirects, project parameter decoding, link builders, primary navigation,
section tabs, titles, and wildcard handling.

Rules for route consumers:

- Build internal destinations with `routePath(routeId, options)`.
- Do not put path literals in `Link`, `NavLink`, `Navigate`, or `navigate()`.
- Decode the location before activating a project. Invalid percent encodings,
  encoded separators, unsupported project IDs, duplicate query values, and
  overlong values fail closed.
- A missing project, malformed direct link, unknown route, and crashed screen
  render owned recovery UI. External exception text and component stacks are
  not user copy.
- Every registered screen receives a stable route heading. On pathname
  transitions, including browser back and forward, focus moves to that heading.
  Query-only modal or selection changes do not steal focus.

The compatibility exports in `utils/routes.ts` remain for extensions during
migration. Production desktop navigation is derived from route IDs.

## Graph adapter boundaries

The graph UI is split by responsibility:

- `graph-store.ts` owns project-scoped resource and operation state.
- `graph-layout-adapter.ts` creates deterministic layout targets and the
  bounded canvas keyboard sequence.
- `GraphMap.tsx` renders and refines the visual SVG projection.
- `graph-position-store.ts` owns versioned, bounded, validated layout
  persistence.
- `semantic-review-adapter.ts` owns semantic scope and edge target decoding.
- `graph-virtualization.ts` creates one deterministic DOM-budgeted projection.
- `StructuredGraphView.tsx` is the non-spatial accessible projection.
- `graph-render-capability.ts` decides whether the optional canvas can mount.

Both visual and structured views consume the same virtualized nodes and edges.
Focus, selected relationship, open-document, and inspect-relationship actions
therefore refer to the same IDs.

## Keyboard model

The visual canvas contributes one tab stop, regardless of graph size:

- Arrow Right or Arrow Down: next projected node.
- Arrow Left or Arrow Up: previous projected node.
- Home or End: first or last projected node.
- Enter or Space: open the current document, or focus the current graph node.

Edges and individual SVG nodes are not tab stops. Zoom in, zoom out, and fit
remain three ordinary buttons. The current canvas node is announced in a live
region.

The structured view uses native node and relationship selects. Arrow keys can
reach every item in the current projection while the tab sequence stays
constant. Separate buttons expose open-document, focus/overview, and inspect
relationship actions. No action requires interpreting position, color, line
direction, or pointer gestures.

## Large graphs and missing capabilities

The default render budget is 180 nodes and 540 edges. Selection is stable and
prioritizes the exact focus, project/repository/workstream anchors, semantic
endpoints, degree, label, and ID. The UI reports omitted counts and directs the
user to choose another focused neighborhood. Stored layout data is capped at
500 nodes, versioned, exact-node-set checked, coordinate bounded, and ignored
when invalid.

If DOM, SVG, animation-frame, or measurement support is missing, the canvas is
not mounted. The synchronized structured view remains available with the same
graph actions.

## Qualification still required

The final integrated campaign pass must run the registered route, graph,
desktop-contract, and browser checks. Release/device qualification must also
exercise keyboard-only navigation, 200% zoom, reduced motion, forced colors,
the supported packaged WebView, and the recorded screen-reader journey. An
unavailable platform is recorded as deferred; it is never labeled as passed.
