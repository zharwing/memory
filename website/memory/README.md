# Zharwing Memory public documentation site

This directory is the dependency-free public documentation page intended for:

```text
https://zharwing.barbutsa.com/memory/
```

It is documentation for the local Zharwing Memory application. It is not a
hosted copy of the product and does not connect to a memory store.

## Contents

- `index.html` — product overview, quick start, privacy boundary, limitations,
  FAQ, GitHub links, and structured metadata.
- `styles.css` — responsive Graphite + Copper presentation with no external
  font, CSS, or analytics dependency.
- `script.js` — progressive enhancement for mobile navigation, screenshot
  selection, copy buttons, and scroll-reveal behavior. It is never the content
  or route authority.
- `docs/` — the categorized documentation portal, stable guide pages, and
  bounded public search index generated from an explicit source manifest.
- `assets/` — the public-safe fictional EchoDesk screenshots and the Zharwing
  feather/circuit brand system.
- `BRAND.md` — logo variants, favicon inventory, and usage constraints.
- `DEPLOYMENT.md` — integration and deployment checklist for the existing
  `zharwing.barbutsa.com` site.

## Local preview

Any static file server can host this directory. From the parent directory:

```text
python -m http.server 4173
```

Open:

```text
http://127.0.0.1:4173/memory/
```

Opening `index.html` directly also renders the page, but clipboard and some
browser behaviors work more reliably over localhost.

Check a direct guide URL as well, for example:

```text
http://127.0.0.1:4173/memory/docs/setup/
```

## Public-data boundary

The screenshots contain only the fictional EchoDesk demo project. Do not copy
real project stores, pointer files, environment configuration, logs, or private
session data into this directory.

The quick start may show only the non-secret `ZHARWING_PUBLIC_DAEMON_URL` and
`ZHARWING_PUBLIC_PROFILE` browser hints. Never publish a daemon,
administrator, agent, or provider credential, a bootstrap code, CSRF value,
private endpoint query, bearer token, or any retired `VITE_*` browser setting.

## Maintenance rule

Keep the landing page short and product-oriented. Detailed documentation stays
authoritative in the repository Markdown files and is rendered into the public
portal with:

```text
corepack pnpm docs:site
corepack pnpm check:docs-site
```

The generator does not discover Markdown automatically. Add an intentionally
public guide to the manifest in `scripts/build-public-docs.mjs`, then review the
source against `docs/SOURCE_CONTEXT.md`. It writes the documentation home, one
`/memory/docs/<slug>/index.html` file per guide, and
`docs/search-index.json`.

Run generation after changing a manifest source, then check direct URLs,
JavaScript-off rendering, native mobile navigation, intrinsic image dimensions,
metadata, local links, the bounded search projection, and synthetic-only
screenshots. Generated pages are build artifacts; never edit them as the
authoritative source. A qualification pass must generate and check the same
candidate.
