# Deployment checklist for `/memory`

This package is prepared for integration into the existing Zharwing website at:

```text
https://zharwing.barbutsa.com/memory/
```

No deployment, DNS change, or external resource creation has been performed.

## Preferred integration

Copy the complete `memory/` directory into the existing site's public route for
`/memory`. Preserve the relative relationship between `index.html`,
`styles.css`, `script.js`, and `assets/`.

The page intentionally uses relative asset URLs, so it can be hosted beneath a
path without a build-time base-path setting.

## Required routing behavior

The host must serve:

```text
/memory/            -> /memory/index.html
/memory/styles.css  -> styles.css
/memory/script.js   -> script.js
/memory/assets/*    -> assets/*
```

Direct requests to `/memory` should redirect to `/memory/` or serve the same
HTML. The trailing slash ensures relative asset URLs resolve consistently.

## Before publishing

1. Confirm `https://github.com/zharwing/memory` is public and is the desired
   canonical source link.
2. Confirm the current README installation commands still match the quick start.
3. Confirm current limitations are truthful for the release being described.
4. Open every GitHub and in-page navigation link.
5. Test desktop at 1440×900 and mobile at 390×844.
6. Verify the page with JavaScript disabled; all essential content must remain.
7. Confirm no local paths, environment values, real project names, or private
   memory content appear in the output.
8. Validate that `/memory` and `/memory/` both work on the final host.

## Search and social metadata

`index.html` already contains:

- canonical URL for `https://zharwing.barbutsa.com/memory/`;
- title and description metadata;
- Open Graph and Twitter card fields;
- `SoftwareApplication` structured data;
- a local SVG favicon.
- a web manifest plus 16, 32, 180, 192, and 512 pixel feather/circuit icons.

The current Open Graph image points to the public dashboard screenshot. A custom
1200×630 social image can replace it later, but it is not required for the first
publication.

## Deliberately excluded

- analytics and tracking;
- cookies, accounts, or sign-in;
- a hosted Memory daemon or API;
- downloads that do not yet have a supported release artifact;
- duplicated copies of the repository's complete technical documentation;
- any dependency or framework requirement.

## Rollback

Because this is a static route, rollback is simply removing the `/memory`
route or restoring the previous static directory from the site's normal source
control/deployment history.
