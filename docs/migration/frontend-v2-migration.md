# Frontend V2 profile migration and rollback

Frontend V2 is a compatibility-preserving internal refactor, not a breaking
API release, and requires no project-content migration. Supported operation
names and canonical Markdown/project data remain compatible. The
`personal-preview` compatibility profile remains the daemon default. The steps
below apply only when an operator explicitly adopts `hardened-local`; that
opt-in changes runtime authority and profile defaults behind retained adapters
and aliases. Upgrade one local installation/profile at a time. Bind the source
and artifact first, make a normal project backup, and keep the prior attested
artifact available until rollback has been exercised.

## Before changing profile

1. Stop browser, desktop, daemon, CLI, and agent clients for the installation.
2. Record the selected project IDs, current profile, daemon location, provider
   kind/status, and any outcome-unknown operations.
3. Back up every affected project through the supported backup operation.
4. Bind branch, commit, lockfile digest, toolchain, profile, and artifact digest.
5. Run the locally reproducible gates in the qualification matrix.
6. Resolve or preserve outcome-unknown journals; do not retry them blindly.

## Migration matrix

| Area | `personal-preview` compatibility | `hardened-local` target | Rollback rule |
| --- | --- | --- | --- |
| Profile selection | `ZHARWING_MEMORY_PROFILE=personal-preview`; remains daemon default during the compatibility window | Explicit `ZHARWING_MEMORY_PROFILE=hardened-local`; Tauri native host sets it for its owned daemon | Restart the complete prior profile; never mix profile components |
| Browser startup | Explicit `personal-preview + authMode=none` may use the bounded preview-session endpoint; authenticated preview uses a trusted one-shot bootstrap | Trusted launcher issues a one-shot exact-Origin/Host, operation- and project-bounded bootstrap | Revoke/expire the current session and establish a new session under the rollback profile |
| Browser configuration | `ZHARWING_PUBLIC_DAEMON_URL` and, for the no-auth preview only, `ZHARWING_PUBLIC_PROFILE=personal-preview` | Only non-secret `ZHARWING_PUBLIC_*` hints; no bearer in frontend bytes | Remove stale `VITE_ZHARWING_MEMORY_*` values; never restore a browser bearer |
| Agent authority | Explicit compatibility surface may remain local | Provision a distinct project-bound `ZHARWING_MEMORY_AGENT_CREDENTIAL` and project ID through a trusted launcher | Revoke the new grant; do not substitute administrator authority |
| Native desktop | Not the native authority profile | Rust launches/owns the exact loopback daemon and reads a one-shot credential file into native memory | Stop the owned daemon and clear native authority; never attach to an unrelated daemon |
| Visibility | Historical personal projects retain their declared policy | Missing/invalid classification is `review-required` and withheld | Do not bulk-promote or weaken classifications to make rollback appear successful |
| Provider secrets | Existing plaintext project credentials must be removed through an operator-reviewed transition | Use write-only status/set/rotate/clear; daemon stores an AES-GCM envelope outside project content | Clear only through the revision-bound operation; never restore plaintext from logs/UI/evidence |
| Destructive effects | Recoverable moves still confirm; permanent/global actions use intents | Same prepare/commit/cancel, expiry, target/revision digest, single-use contract | Reconcile unknown outcomes; never reuse an intent or re-enable confirmation bypass |
| Preferences | Only bounded, non-sensitive `zharwing-memory:` UI preferences may persist | Same; credentials, CSRF, payloads, diagnostics, and project data are forbidden | Delete optional preference keys; removal must not affect project data |
| Graph layout | Historical cache keys may remain during the dated compatibility window | Layout payload format 3 validates exact node set, bounded coordinates, and size; visual and structured views share the bounded projection | Delete layout caches and recompute; never delete domain graph data |
| Routes | Legacy unscoped bookmarks redirect/build through the typed registry during the window | Project-scoped registered URLs are authoritative; malformed/missing project links recover safely | Keep redirects until reachability and bookmark policy permit removal |

## Visibility review

Hardened mode never infers AI eligibility from the absence of a field. Review
sessions, checkpoints, documents, search rows, workstreams, inbox items, repo
links, semantic edges, startup summaries, and derived results through the owned
classification action. Agent-written session authority is protected outside
project content and bound to project generation, owner, exact revisions, and
the admitted effect. A later human write invalidates that authority rather
than inheriting it.

The migration must not rewrite content, follow links, trust project-authored
claims, or bulk-classify a store simply to reduce withheld counts.

## Preference and graph cache details

Unknown, malformed, oversized, or unavailable browser preference values are
ignored. The removed `aimem.delete.confirm.skip.*` preference has no supported
reader after V2 reconciliation and may be deleted manually; every recoverable
or permanent delete continues to show its owned confirmation.

The layout storage key still begins `aimem.graph.positions.d3.v2:` during the
compatibility window so existing local layouts remain discoverable. The
version inside the payload is authoritative and is currently `3`; the key name
must not be interpreted as the payload version. A version mismatch, different
node set, malformed coordinate, oversized key/payload, or unavailable storage
causes deterministic recomputation. Layout removal is always recoverable.

## Compatibility window

The residual paths and production callers are enumerated in
[Frontend V2 compatibility register](frontend-v2-compatibility-register.md).
The planned review date is 2026-11-01. A date alone does not authorize deletion.
Removal requires zero production callers for the selected profile, emitted-byte
or packaged reachability evidence, focused regression coverage, and a rollback
that retains current security/privacy behavior.

## Rollback

Rollback selects the last attested artifact and its matching complete profile.
It does not rebuild an unbound artifact, restore a shared browser bearer, weaken
privacy defaults, delete integrity records, or replay an uncertain effect.

1. Stop the affected profile and preserve protected authority/journal state.
2. Revoke new browser, agent, desktop, and provider grants where applicable.
3. Restore the prior artifact/profile pair and establish fresh sessions.
4. Reobserve projects and reconcile unknown operations before new effects.
5. Delete only optional UI/layout caches when needed.
6. Verify canonical project content and backups without rewriting them.
7. Record the rollback result against the exact artifact and environment.

Keep V2 privacy projection, write-only secrets, destructive intents, typed
transport, async generation guards, closed errors, and accessibility fixes
through rollback unless a separately reviewed bounded rollback proves safe.
