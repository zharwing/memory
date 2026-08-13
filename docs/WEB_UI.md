# Browser UI

Zharwing Memory's local browser UI is the same React product surface used by
the Tauri application. It connects to the loopback daemon and private local
store. It is not the public documentation website.

## Security model

Browser JavaScript never receives or sends a daemon, administrator, agent,
desktop, provider, or backup bearer. It uses an opaque `HttpOnly`,
`SameSite=Strict` session cookie plus a CSRF token held only in memory. Exact
loopback Host and Origin checks apply to session and RPC requests. Credentials,
bootstrap codes, CSRF values, project data, and diagnostics do not belong in
local storage, URLs, logs, generated assets, or source maps.

Only two non-secret values may be compiled into browser code:

```text
ZHARWING_PUBLIC_DAEMON_URL=http://127.0.0.1:37841
ZHARWING_PUBLIC_PROFILE=personal-preview
```

The Vite configuration exposes only the `ZHARWING_PUBLIC_` prefix. Do not add
`VITE_*` credentials. The retired `VITE_ZHARWING_MEMORY_AUTH_TOKEN` flow is not
supported by the implemented browser composition.

## Profiles

| Profile | Browser startup | Boundary |
| --- | --- | --- |
| `personal-preview` | Starts automatically through `pnpm dev`, `dev:daemon`, and `dev:web` | Normal loopback-only mode for one trusted local user; no credential setup |
| Authenticated `personal-preview` | A trusted launcher supplies a one-shot code in the URL fragment | Cookie + memory-only CSRF; the preview endpoint is absent |
| `hardened-local` | A trusted launcher supplies a one-shot, exact-Origin/Host, operation- and project-bounded code in the URL fragment | Required authenticated browser model; no automatic preview fallback |

The daemon has no HTTP endpoint that mints bootstrap authority. A launcher must
issue the one-shot grant through the trusted composition and deliver it as
`#bootstrap=<code>`. The browser removes the fragment before the network
exchange. `dev:web` by itself cannot create hardened authority.

## Run the local compatibility preview from source

Requirements are Node.js `22.21.x` or a supported Node 24 release, pnpm 9 via
Corepack, and a private memory root outside the source checkout.

Configure only the private store location if the default is not suitable:

```text
ZHARWING_MEMORY_ROOT=<absolute-private-store-path>
```

Then start everything with one command:

```text
corepack pnpm dev
```

Open `http://127.0.0.1:5174/`. No token or launcher step is required. The
two-terminal `dev:daemon` plus `dev:web` workflow selects the same mode. It is
refused on a non-loopback host and must never be exposed through a proxy, LAN
bind, tunnel, or public network.

For authenticated preview or hardened-local browser work, use the trusted
launcher/bootstrap procedure in [Browser session protocol](security/browser-session.md)
instead of placing a token in frontend configuration.

## Session and project transitions

The frontend exposes locked, exchanging, ready, rotating, and expired session
states. Binding a different allowed project rotates the cookie, CSRF token,
session identity, and rotation identity before project data is accepted. A 401
or 403 clears frontend authority and hides scoped content. A consequential
operation is not replayed merely because a new session was established; an
unknown outcome must be reconciled first.

Typed routes keep the project in the URL. Direct links, refresh, and browser
back/forward activate the URL's exact project generation before mounting a
project screen. Malformed or missing project links render owned recovery UI.

## Browser versus native desktop

| Behavior | Browser UI | Native Tauri app |
| --- | --- | --- |
| Product pages | Shared React routes and workflows | Shared React routes and workflows |
| Authority | Cookie + in-memory CSRF | Rust-owned desktop principal; no credential in the webview |
| Daemon | Start separately; hardened use needs a trusted bootstrap launcher | Rust launches and owns an exact hardened-local daemon |
| Folder selection | Type or paste absolute paths | Explicit OS folder-picker capability |

Browsers cannot reveal arbitrary absolute folder paths. This platform limit is
why browser mode has no native Browse action.

## Troubleshooting

- **Session refresh shown:** reload the app. Normal local mode establishes a
  fresh session automatically.
- **Daemon unavailable:** confirm `dev:daemon` is running at the exact value of
  `ZHARWING_PUBLIC_DAEMON_URL` and that Host remains loopback.
- **401 or 403:** the old session is unusable. Do not copy a bearer into the
  browser; establish a new preview session or trusted bootstrap.
- **Port 5174 is busy:** Vite uses strict port 5174. Stop the existing process.
- **Public website shows no projects:** expected. It is static documentation
  and cannot access local data.

See [Browser session protocol](security/browser-session.md),
[Principal model](security/principal-model.md), and
[Frontend V2 migration](migration/frontend-v2-migration.md).
