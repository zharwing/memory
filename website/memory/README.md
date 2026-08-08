# Zharwing Memory public documentation page

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
  tabs, copy buttons, and scroll-reveal behavior.
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

## Public-data boundary

The screenshots contain only the fictional EchoDesk demo project. Do not copy
real project stores, pointer files, environment configuration, logs, or private
session data into this directory.

## Maintenance rule

Keep this page short and product-oriented. Detailed technical documentation
belongs in the public GitHub repository and should be linked rather than copied.
