# ADR 0002: Progressive Public Documentation

Status: accepted

## Context

The original documentation portal placed every guide in one HTML file, hid
articles by default, and used a URL fragment plus JavaScript as its router.
Direct pages, reliable metadata, link previews, no-JavaScript reading, and
failure-safe mobile navigation were therefore impossible.

## Decision

Generate one static HTML page per allowlisted guide. Each page owns a stable
path, metadata, visible article, visible navigation, and ordinary section
anchors. The documentation home is a linked guide directory.

JavaScript is progressive enhancement only. It may provide bounded client-side
search, copy actions, active-section highlighting, and optional reveal effects.
Reveal styles apply only after a `.js` capability class and an initialized
element marker are both present. Mobile documentation navigation and table-of-
contents disclosure use native `details` and `summary` semantics.

The search index is a separate bounded projection of public titles,
descriptions, groups, paths, and headings. Article bodies and source paths are
not search-index fields.

## Consequences

- Every guide works as a direct URL and has correct canonical metadata.
- A script failure cannot remove essential content or navigation.
- Static hosting needs no server-side router.
- Generated output grows with the guide count, but every page stays bounded and
  cacheable.
- Link integrity and private-data checks can evaluate concrete artifacts.

## Revisit When

Revisit only if a replacement preserves static direct URLs, no-JavaScript
content, bounded sanitized search, native keyboard navigation, and deterministic
generation. Framework adoption alone is not a reason to weaken these properties.
