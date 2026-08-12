# Cloudflare deployment for `/memory`

This package is prepared for integration into the existing Zharwing website at:

```text
https://zharwing.barbutsa.com/memory/
```

The repository-level `wrangler.jsonc` deploys `website/` as static assets from
the `zharwing-docs` Cloudflare Worker. The custom-domain binding creates and
manages the DNS record and certificate for `zharwing.barbutsa.com`.

## Source layout

The complete `memory/` directory is deployed beneath `/memory`. Preserve the
relative relationship between `index.html`, `styles.css`, `script.js`, and
`assets/`.

The page intentionally uses relative asset URLs, so it can be hosted beneath a
path without a build-time base-path setting.

Generate the public documentation before assembling a deployment artifact:

```text
corepack pnpm docs:site
corepack pnpm check:docs-site
```

The generated artifact includes the documentation home, one stable directory
and `index.html` per allowlisted guide, and `docs/search-index.json`. Generation
is a public-source projection; it must not read a memory store, environment
file, execution evidence, or arbitrary Markdown.

## Required routing behavior

The host must serve:

```text
/memory/            -> /memory/index.html
/memory/styles.css  -> styles.css
/memory/script.js   -> script.js
/memory/assets/*    -> assets/*
/memory/docs/       -> /memory/docs/index.html
/memory/docs/*/     -> each guide's index.html
/memory/docs/search-index.json -> bounded public search projection
```

Direct requests to `/memory` should redirect to `/memory/` or serve the same
HTML. The trailing slash ensures relative asset URLs resolve consistently.

`website/_redirects` sends both the hostname root and `/memory` to
`/memory/`. `website/_headers` adds baseline browser security headers.

## Deploy

Use a pinned Wrangler 4 release from the repository root:

```text
wrangler deploy --config wrangler.jsonc --dry-run
wrangler deploy --config wrangler.jsonc
```

After deployment, verify `/`, `/memory`, `/memory/`, `/memory/docs/`, at least
one direct guide URL, the search index, a static asset, the security headers,
`robots.txt`, `sitemap.xml`, and the custom 404 response.

## Before publishing

1. Confirm `https://github.com/zharwing/memory` is public and is the desired
   canonical source link.
2. Confirm the current README installation commands still match the quick start.
3. Confirm current limitations are truthful for the release being described.
4. Open every GitHub, cross-guide, and in-page navigation link.
5. Test desktop at 1440×900 and mobile at 390×844.
6. Verify the page with JavaScript disabled; all essential content must remain.
7. Confirm no local paths, environment values, real project names, or private
   memory content appear in the output.
8. Validate that `/memory`, `/memory/`, `/memory/docs/`, and copied direct guide
   URLs work on the final host.
9. Confirm the search index contains only public titles, descriptions, groups,
   stable paths, slugs, and bounded headings.

## Search and social metadata

The landing page and each generated guide contain route-specific metadata.
The landing page includes:

- canonical URL for `https://zharwing.barbutsa.com/memory/`;
- title and description metadata;
- Open Graph and Twitter card fields;
- `SoftwareApplication` structured data;
- a local SVG favicon.
- a web manifest plus 16, 32, 180, 192, and 512 pixel feather/circuit icons.

The current Open Graph image points to the fictional public dashboard
screenshot. Guide pages use their own title, description, canonical URL, and
Open Graph URL so a directly shared guide is described accurately.

## Deliberately excluded

- analytics and tracking;
- cookies, accounts, or sign-in;
- a hosted Memory daemon or API;
- downloads that do not yet have a supported release artifact;
- duplicated copies of the repository's complete technical documentation;
- any dependency or framework requirement.

## Rollback

Because this is a versioned static Worker deployment, rollback restores the
previous `zharwing-docs` deployment. Removing the custom-domain binding is a
separate, intentional Cloudflare configuration change.
