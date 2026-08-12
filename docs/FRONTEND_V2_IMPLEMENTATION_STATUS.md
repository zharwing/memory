# Frontend V2 implementation status

Snapshot: 2026-08-12.

This page is the concise public reading guide for the V2 frontend source. The
implementation blueprint and execution ledger remain the authoritative plan
and package state; this page does not replace them or promote a package.

## Compatibility boundary

Frontend V2 is a compatibility-preserving internal refactor, not a breaking
API release. Supported operation names, canonical Markdown/project data, and
the documented client surface remain compatible. Dated adapters and aliases
continue to cover existing clients, bookmarks, profile transitions, and local
preview workflows; their explicit removal conditions are tracked in the
[compatibility register](migration/frontend-v2-compatibility-register.md).
The retired browser-side `VITE_*` bearer input is the deliberate security
exception: browser authentication now uses the documented cookie/CSRF
bootstrap, while trusted Node compatibility credentials and aliases remain.

## Implemented architecture

- Browser, Tauri, trusted administrator, agent, provider, and backup audiences
  have separate composition and admission paths.
- One operation registry owns names, audience, scope, effect class,
  compatibility, request/response codecs, cancellation, timeout, idempotency,
  and result projection.
- Project-scoped async work captures an immutable generation and signal; stale
  success and stale failure cannot commit into the new project.
- Agent reads pass through privacy-complete entity/result projections. Missing
  visibility fails closed in hardened-local.
- Provider credentials are write-only status/set/rotate/clear resources and
  provider egress is destination constrained.
- Permanent/global effects use prepared, expiring, single-use intents rather
  than treating a dialog as authorization.
- Frontend recovery distinguishes root, session, route, resource, and
  operation failures and renders only owned public copy.
- Static semantic tokens and accessible primitives govern focus, forms,
  dialogs, async states, responsive reflow, reduced motion, and forced colors.
- A typed route registry owns route elements, builders, navigation, decoding,
  redirects, wildcard recovery, and route heading focus.
- Graph layout, rendering capability, persistence, interaction state,
  virtualization, semantic review, and structured accessibility are separate
  boundaries. The structured graph remains complete when the visual canvas is
  unavailable.
- The public website is static/progressively enhanced and the repository owns
  its docs generator and drift checker.
- Build controls cover startup/chunk/CSS budgets, source maps, fixtures,
  forbidden imports, emitted credential names/canaries, evidence manifests,
  and conditional SBOM/checksums.

## Product profiles

`personal-preview` is retained for explicit, loopback-only compatibility. It
is the daemon default during the migration window and is not a hardened claim.
`hardened-local` is implemented as the target security profile and is selected
explicitly; the native Tauri host always launches its owned daemon under that
profile.

See [Developer preview](DEVELOPER_PREVIEW.md),
[Browser UI](WEB_UI.md), [Security docs](security/principal-model.md), and
[Migration](migration/frontend-v2-migration.md).

## What remains unclaimed

The integrated working tree was validated locally on 2026-08-12 with supported
Node 24.19.0. The workspace typecheck passed; the consolidated runner passed
333 tests with zero failures and two intentional Windows symlink-safety skips;
the production web build, unchanged bundle budgets, isolated secret-canary
build, fixture reachability, accessibility source contract, generated public
docs, source-artifact guard, and headless Edge startup-recovery smoke all
passed. The final build contains a 385,232-byte entry, 1,099,243-byte largest
chunk, 4,447,846 total JavaScript bytes, 114,241 CSS bytes, and 187 files.

These results describe an uncommitted local working tree. They are not a
commit-bound release evidence packet and do not approve a release. Six Rust
unit tests and the CI-equivalent Tauri compile/package mechanics passed using
an explicitly inert sidecar fixture. That fixture is not a production daemon,
and it does not qualify packaged runtime behavior, signing, or installers.

The following remain explicit qualification obligations until exact evidence
exists: supported-browser critical journeys, packaged Windows WebView/sidecar,
NVDA/Edge and other assistive technology, 200% zoom/forced-colors/reduced-motion
manual journeys, physical touch/small-screen devices, selected live providers,
installer/signing/promotion, and rollback rehearsal.

See [Frontend qualification matrix](qualification/frontend-qualification-matrix.md).
