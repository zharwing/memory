# Source And Context Boundary

The public documentation website is a deterministic projection of explicitly
reviewed repository documents. It is not a projection of a user's Memory
project and it never discovers content by walking private or machine-local
directories.

## Public Source Manifest

`scripts/build-public-docs.mjs` owns the allowlist of published guides. Each
entry declares a repository-relative Markdown source, stable slug, title,
description, and navigation group. A document is public only when it is added
to that manifest and reviewed as public content.

The generator reads only those declared files. It does not ingest:

- a configured memory root or any project/session store;
- `.env` files, credentials, key files, or local credential caches;
- execution snapshots, handoffs, review archives, or test artifacts;
- implementation blueprints and internal campaign baselines;
- arbitrary untracked Markdown discovered by globbing;
- local browser storage, diagnostics, logs, or provider responses.

Repository source links that are not in the guide manifest remain ordinary
GitHub links. They are not silently copied into the public artifact.

## Generated Pages

Every guide is written to a stable path:

```text
/memory/docs/<guide-slug>/
```

The page contains its own title, description, canonical URL, Open Graph
metadata, navigation, article, section links, and previous/next links. Content
and navigation are present in HTML and remain readable when JavaScript is
blocked. JavaScript may add search, copy buttons, active-section highlighting,
and reveal motion, but it is not the route or content authority.

Images published by the guide generator come from a small explicit asset map.
They receive an alt description plus intrinsic width and height. An unknown
image is linked instead of being emitted as an unbounded public asset.

## Bounded Search Projection

`search-index.json` is a separate allowlisted projection. Each entry contains
only:

- stable guide slug and public path;
- public title, description, and group;
- a bounded list of public section headings.

The index contains no article body, source path, author workstation path,
diagnostic metadata, project identifier, credential, raw query, or private
context. Field lengths, entry keys, and total encoded size are bounded. Search
runs in the browser against this file and does not send queries to Memory or a
third-party service.

## Synthetic Product Evidence

Public screenshots use fictional project data created for the website. A real
project name, source path, session, document, graph node, provider response, or
memory-store record must never be substituted as a convenient screenshot or
example.

Before publication, the generated pages, index, linked assets, and metadata are
checked for private-data canaries, credential-shaped values, missing intrinsic
image dimensions, broken local links, hidden essential content, and missing
direct pages. Publication and deployment remain separate authorized actions.

## Change Procedure

1. Decide whether the source is intentionally public and free of user data.
2. Add or update the Markdown source.
3. Add the guide to the explicit manifest when it needs a public page.
4. Generate the site locally.
5. Run the public documentation and source-artifact checks.
6. Review the JavaScript-off page, mobile native navigation, direct URL,
   metadata, links, search projection, and synthetic assets.
7. Publish only through the separately authorized deployment process.

When in doubt, keep a source out of the public manifest. An omitted guide can
be reviewed later; leaked private context cannot be made private again.
