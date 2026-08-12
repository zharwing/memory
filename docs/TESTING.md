# Frontend testing and qualification

Tests protect privacy, authority, durable Markdown, operation semantics, and
complete keyboard access before they optimize coverage percentages. A green
command applies only to the exact source, dependencies, environment, profile,
and artifact that produced it.

## Repository commands

| Purpose | Command |
| --- | --- |
| Source hygiene | `corepack pnpm check:source-artifacts` |
| Workspace typecheck | `corepack pnpm typecheck` |
| Deterministic compiled suite | `corepack pnpm test` |
| Coverage thresholds | `corepack pnpm test:coverage` |
| Desktop source contracts | `corepack pnpm test:desktop` |
| Accessibility source contract | `node scripts/check-frontend-accessibility.mjs` |
| Build generated public docs | `corepack pnpm docs:site` |
| Reject public-doc drift | `corepack pnpm check:docs-site` |
| Browser build + budgets + secret scan | `corepack pnpm build:web` |
| Supported local browser smoke | `corepack pnpm test:desktop-browser` |
| Rust authority tests | `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml` |
| Packaged desktop build | `corepack pnpm build:desktop` |
| Frontend evidence manifest | `corepack pnpm evidence:frontend` |
| Conditional SBOM/checksums | `corepack pnpm sbom:frontend` |
| Candidate source bundle | `corepack pnpm release:frontend:candidate` |
| Opt-in provider check | `corepack pnpm test:live-provider` |

The final V2 orchestrator validation is a separate required state check. It
does not substitute for code, browser, packaging, or manual evidence.

## What the source suites cover

- closed runtime schemas and one operation registry across browser, desktop,
  administrator, provider, and agent audiences;
- Host/Origin, browser bootstrap, cookie/CSRF, rotation, revocation, and
  project-binding matrices;
- privacy completeness, missing-visibility fail-closed behavior, never-send
  rules, secret canaries, and agent result projection;
- project-generation A-B-C/A-B-A races, cancellation, polling disposal,
  idempotency, compatibility, and outcome-unknown reconciliation;
- destructive intent expiry, replay, wrong target/revision, and cancellation;
- write-only provider secrets and destination/DNS/redirect/size policy;
- loading, refresh, partial, stale, offline, refused, failure, and recovery
  state distinctions;
- dialogs, forms, focus, route recovery, typed route reachability, graph
  virtualization, bounded keyboard navigation, and structured graph parity;
- semantic tokens, registered contrast pairs, reduced motion, forced colors,
  formatter ownership, and responsive source constraints; and
- public docs, bundle budgets, forbidden imports/fixtures, source maps,
  credential names, and emitted secret canaries.

## Current CI versus release qualification

The checked-in CI workflow runs source hygiene, typecheck, deterministic tests,
browser builds, Windows Edge smoke, packaged desktop build, Rust tests, and a
clean-diff check across its declared jobs. It does not by itself prove the
manual assistive/device matrix, live provider compatibility, installer/signing,
or rollback rehearsal. Public-doc and accessibility commands must be verified
against the final integrated workflow before claiming that CI enforces them.

The Windows CI jobs compile a deliberately inert Rust executable and pass it
as the Tauri external-binary fixture. This lets Cargo and Tauri exercise their
real command manifest, capability, sidecar naming, copy, cleanup, and packaging
boundaries without committing or publishing a binary. The fixture exits
immediately and is never a product daemon or release artifact. A releasable
Windows application still requires the separately built, approved, hashed
daemon sidecar and packaged runtime smoke.

Local automated validation was run on the uncommitted 2026-08-12 working tree
with supported Node 24.19.0. The workspace typecheck and 333 tests passed with
zero failures and two intentional Windows symlink-safety skips. The production
web build and budgets, isolated secret-canary build, fixture reachability,
accessibility source contract, generated public docs, source-artifact guard,
and headless Edge startup-recovery smoke also passed. Six Rust unit tests and
the Tauri compile/package mechanics passed with the explicitly inert fixture.
These are local results, not release approval: no real packaged daemon/runtime
or signed Windows installer was qualified. The qualification matrix keeps local
implementation confidence separate from commit-bound release and device
evidence.

## Final integrated order

1. Bind branch, commit, lockfile digest, profile, toolchain, and clean status.
2. Review the final changed-file list and production/test boundary.
3. Run source hygiene, V2 state validation, typecheck, and deterministic tests.
4. Repair only focused failures, then rerun a broad command once if affected.
5. Build and check public docs.
6. Run accessibility source checks.
7. Build browser assets; run budgets, forbidden-reachability, source-map, and
   secretless emitted-byte scans.
8. Generate evidence manifest and SBOM/checksums for the same artifacts.
9. Run available browser/Rust/Tauri gates and the declared manual matrix.
10. Record unsupported combinations and unexpected skips without upgrading
    them to pass.

Use disposable stores and synthetic credentials only. Never point tests at a
private memory root. See [AI provider testing](AI_TESTING.md),
[Frontend qualification matrix](qualification/frontend-qualification-matrix.md),
and [Frontend accessibility contract](accessibility/FRONTEND_ACCESSIBILITY_CONTRACT.md).
