# Developer preview boundary

Status as of 2026-08-12: the repository contains source implementations for
the `personal-preview` compatibility profile and the `hardened-local` security
profile. This does **not** mean a release candidate, installer, device matrix,
or hardened deployment has been qualified.

Zharwing Memory remains a local, single-user developer preview. It is not a
multi-tenant service, remote collaboration server, public data host, or
general-purpose agent sandbox. Publishing, signing, deployment, store
migration, and credential rotation require separate operator actions.

## Implemented profile boundary

| Area | `personal-preview` | `hardened-local` |
| --- | --- | --- |
| Intended use | One trusted local developer; explicit compatibility | Target least-privilege local model |
| Daemon binding | Exact loopback; `none` or token according to explicit configuration | Exact loopback and token/session authentication required |
| Browser | Explicit no-auth preview session only for `personal-preview + none`, otherwise trusted one-shot bootstrap | Trusted one-shot bootstrap, HttpOnly cookie, memory-only CSRF |
| Native desktop | Not the packaged native authority profile | Rust owns daemon lifecycle and a one-shot desktop credential; webview never sees it |
| Agent | Compatibility surface may remain enabled explicitly | Distinct project-bound agent credential and registered agent operations |
| Missing visibility | Historical compatibility default may remain AI-eligible | Withheld as `review-required`; never silently promoted |
| Provider secrets | Never browser-readable; legacy project plaintext must not be reintroduced | Write-only daemon envelope and destination policy |

The runtime default remains `personal-preview` until a separately governed
migration changes it. The Tauri native composition deliberately launches its
owned daemon as `hardened-local`. Browser and Tauri composition roots do not
fall back to one another.

## Source capabilities present

- runtime-decoded typed operation registry and closed public errors;
- project-generation guards, cancellation, idempotency, and outcome-unknown
  reconciliation boundaries;
- browser cookie/CSRF sessions and native Rust-owned desktop authority;
- privacy projection over agent-visible entities and operation results;
- write-only provider secrets, constrained provider egress, and revision-bound
  secret rotation;
- prepare/commit/cancel destructive intents for permanent/global effects;
- semantic tokens, accessible primitives, responsive/reduced-motion/
  forced-colors source contracts;
- typed routing with owned invalid-link recovery and an accessible structured
  graph fallback; and
- secretless build, budget, source-artifact, evidence, and SBOM/checksum
  scripts.

These are source facts, not evidence that every integrated gate passed for a
particular commit or artifact.

## Compatibility and migration

Frontend V2 is a compatibility-preserving internal refactor, not a breaking
API release. Supported operation names and canonical Markdown/project data are
unchanged at the external boundary. Dated client aliases, registered URLs, and
local preview paths remain available while their explicit removal conditions
are evaluated.

Canonical Markdown project content is not rewritten merely to select a
profile. Back up first, provision role-specific credentials, review visibility,
and let only non-sensitive preferences/layout caches reset. The dated residual
paths and their removal conditions are recorded in
[Frontend V2 compatibility register](migration/frontend-v2-compatibility-register.md).
The full procedure and rollback are in
[Frontend V2 migration](migration/frontend-v2-migration.md).

## Qualification boundary

Source implementation may be described as complete only after the integrated
source pass is reviewed and all locally reproducible required gates pass for
one bound candidate. Release/device qualification additionally requires the
declared browser, packaged WebView, assistive-technology, physical-device,
installer, signing, and rollback evidence.

Local validation of the uncommitted 2026-08-12 working tree passed the
workspace typecheck, 333 automated tests with zero failures and two intentional
Windows symlink-safety skips, the browser build and unchanged budgets, isolated
secret-canary, fixture, source-artifact, accessibility-source, and public-doc
checks, plus headless Edge startup recovery. Six Rust unit tests and the Tauri
compile/package mechanics passed with an inert sidecar fixture. No candidate
digest or release artifact was bound, and the real packaged daemon/runtime
qualification remains open. Use the live
[frontend qualification matrix](qualification/frontend-qualification-matrix.md)
and an artifact evidence manifest; never carry forward an older workspace's
green result.

Unsupported or unobserved combinations must be recorded as
`deferred_platform_validation`, not pass. In particular, NVDA/Edge, packaged
Windows WebView, touch/coarse-pointer hardware, physical small-screen browser,
installer/signing, live provider targets, and rollback rehearsal remain
release/device obligations until exact evidence exists.

## Candidate gate order

From a clean checkout with the frozen lockfile and supported toolchain:

1. validate execution state and review the candidate diff;
2. run source-artifact, type, deterministic test, and accessibility checks;
3. build public docs and reject generated drift;
4. build browser assets and run budget, fixture, source-map, and secret scans;
5. generate the artifact-bound evidence manifest and SBOM/checksums;
6. run available browser, Rust, and packaged desktop gates; and
7. record every manual or unavailable matrix row explicitly.

The exact commands are maintained in [Testing](TESTING.md) and
[Frontend release controls](release/frontend-release-controls.md).
