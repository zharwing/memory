# Browser session protocol

## Purpose

The browser uses a short-lived, origin-bound session. It never receives the
daemon bearer used by trusted non-browser compositions. Browser JavaScript
holds only a CSRF token in memory; the session secret is an opaque HttpOnly
cookie.

The server applies the protocol only on an exact loopback Host and an exact
loopback `Origin`. CORS echoes that accepted origin, permits credentials, and
never uses a wildcard.

## Profiles

The hardened path is available in `hardened-local` and in authenticated
`personal-preview`:

1. a trusted launcher issues a one-shot grant;
2. the browser exchanges it;
3. all browser domain calls use cookie plus CSRF admission.

An authority-free compatibility path exists only when both conditions are
explicitly selected:

- `profile === "personal-preview"`; and
- `authMode === "none"`.

That combination is loopback-only. `POST /browser-session/preview` is absent
and returns 404 in token-authenticated preview and in `hardened-local`.

## Trusted bootstrap issuance

No HTTP endpoint mints a bootstrap code. The trusted launcher calls
`issueBrowserBootstrap(admission, origin, host, grant)`, which delegates to
`BrowserSessionService.issueBootstrap`.

The grant fixes:

- principal identity and trusted session owner;
- a non-empty registered `OperationName` grant; effective access is still
  intersected with the registry's browser audience at admission;
- an initial project or `null`;
- the complete set of project IDs the launcher allows this browser to bind;
- an optional policy digest;
- the exact origin and Host.

The initial project, when present, must be included in the allowed project set.
The daemon stores only a SHA-256 digest of the opaque bootstrap code. The
default bootstrap lifetime is 60 seconds and the process-local queue is
bounded. Deliver the raw code out of band or in a URL fragment, never in a
query string, frontend bundle, log, diagnostic, or persisted browser storage.

## Exact HTTP endpoints

Every session mutation is POST-only. GET and HEAD cannot issue, rotate, bind,
or revoke authority.

| Endpoint | Request body and credentials | Successful result |
| --- | --- | --- |
| `POST /browser-session/bootstrap` | JSON `{"code":"<one-shot>"}`, exact Origin/Host, no prior cookie | 200, a new session cookie, and `{csrfToken, expiresAt, rotationId, projectId}` |
| `POST /browser-session/rotate` | JSON `{}`, current cookie, Origin/Host, `x-csrf-token` | 200, replacement cookie and the same four-field public state |
| `POST /browser-session/project` | JSON `{"projectId":"<allowed-id>"}`, current cookie, Origin/Host, `x-csrf-token` | 200, an atomic replacement project-bound session and four-field public state |
| `POST /browser-session/revoke` | JSON `{}`, current cookie, Origin/Host, `x-csrf-token` | 204 and an expired session cookie |
| `POST /browser-session/preview` | JSON `{}`, exact Origin/Host; only explicit loopback `personal-preview + authMode=none` | 200, an unbound compatibility browser session with a daemon-derived allowlist of currently registered projects and four-field public state |

Malformed bodies are rejected. Invalid, expired, replayed, wrong-Origin, or
wrong-Host bootstrap codes return the same unauthorized outcome. A bootstrap
record is removed before expiry/origin/host decisions, so even a failed
claimant cannot replay it or race a second consumer.

## Cookie and CSRF properties

The cookie name is `zharwing_browser_session`. It is emitted with:

- `Path=/`;
- `HttpOnly`;
- `SameSite=Strict`;
- a bounded `Max-Age`;
- `Secure` when the bound loopback origin is HTTPS.

The service stores only digests of the cookie and CSRF token. The public JSON
contains the CSRF token, expiry, rotation ID, and current project ID; it never
contains the cookie, bootstrap code, principal ID, operation set, policy
digest, or daemon bearer.

Browser RPC calls `POST /rpc` with `credentials: "include"` and the
`x-csrf-token` header. The current server authenticates cookie, CSRF, exact
origin, exact Host, expiry, authority epoch, revocation, and rotation before
the registrar; the registrar repeats the browser-CSRF requirement as a
defense-in-depth gate. This applies to every browser domain POST, including
reads such as health. Browser code never sends `Authorization`.

## Rotation, revocation, and project binding

Rotation and project binding revoke the old authority before issuing the
replacement. A stale cookie/CSRF pair fails immediately even when its original
expiry is in the future.

`POST /browser-session/project` does not accept caller knowledge of a project
ID as authority. It succeeds only for a launcher-granted ID. A project created
by the currently authenticated browser is added to the allowed set only after
the decoded `memory.create_project` result succeeds; arbitrary input cannot
add an existing project. Binding rotates the cookie, CSRF token, session ID,
and rotation ID while retaining only the granted operation set and allowed
project set. It does not require a second bootstrap.

The explicit authority-free preview endpoint derives its initial allowed
project IDs from the daemon registry at session creation. It never turns a
browser-provided ID into authority. Preview is therefore usable for existing
local projects without weakening hardened or token-authenticated sessions.

Revocation invalidates the authority session and rotation, removes the
process-local session record, and expires the browser cookie.

## Client state machine

The frontend should expose these states:

- `locked`: no usable session; route data is hidden;
- `exchanging`: a one-shot bootstrap is being consumed;
- `ready(projectId | null)`: cookie and in-memory CSRF are usable;
- `rotating`: refresh or project binding is in flight;
- `expired`: a 401 or 403 made authority unusable.

On 401 or 403, clear the CSRF token and project acceptance immediately, hide
project content, and require a new bootstrap or explicit preview-session
establishment. Do not retry a consequential request merely because
reauthentication succeeded; its effect may be unknown. Idempotent replay is
governed by the registrar contract, not by the session client.

CSRF, bootstrap codes, and bearers must not be placed in local/session storage,
URLs, source code, generated assets, source maps, analytics, error text, or
diagnostics.

## Restart and rollback

Bootstrap and browser-session records are intentionally process-local. Daemon
restart, authority epoch advancement, rotation, revocation, or profile change
locks existing clients.

Rollback from `hardened-local` means restarting under the complete
`personal-preview` profile and establishing a new session through that
profile. Never keep the prior cookie/CSRF pair or expose the daemon bearer to
make an old browser session work. The unauthenticated preview endpoint is a
compatibility opt-in, not a fallback attempted automatically after a hardened
failure.

## Synthetic evidence

Focused tests cover successful exchange, one-shot replay, expiry, wrong
Origin/Host, GET/HEAD inertness, missing/wrong CSRF, rotation replacement,
project allowlisting, newly created project allowance, revocation, profile
gating of preview, and browser attempts to use non-browser bearers. Build scans
use only synthetic canaries and include source maps and emitted assets.
