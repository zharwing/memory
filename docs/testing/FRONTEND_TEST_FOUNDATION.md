# Frontend test foundation

## Purpose and boundary

The frontend test foundation exercises the real desktop application composition
without inventing a second preview application. A scenario creates the real
`OperationClient`, application runtime, `RootStore`, route tree, `StoreProvider`,
and `App`. Only the external `MemoryTransport` carrier is replaced.

The fake carrier is deliberately below the production client boundary. It
validates operation input, audience, version, project scope, and registered
success output with the production operation registry. The production client
then decodes the emitted response envelope again. Malformed envelopes,
transport loss, public refusals, pending work, and successful values therefore
follow the same error classification used by the application.

Fixtures are deterministic, fictional, credential-free, and in memory. They
must never contact a daemon, invoke Tauri, use browser persistence, read a
private Memory root, or write any store. The sentinel
`ZHARWING_FRONTEND_SYNTHETIC_CANARY_DO_NOT_SHIP_7F6C` exists only to make an
accidental fixture leak fail closed.

## Scenario registry

`apps/desktop/src/testing/scenario-registry.ts` is the single registry. Each
entry declares a route, capability profile, external-response plan, and named
requirements so a registry test can detect omitted coverage.

| Scenario family | Directly represented states |
| --- | --- |
| Startup and resources | idle, initial loading, empty complete, populated complete, partial complete, refresh with retained data |
| Recovery | stale/offline, unauthorized, privacy refusal, validation, conflict, definite failure, outcome unknown/reconciling, malformed boundary response |
| Content scale | long labels, missing optional data, 500 documents, 200 sessions, and a 600-node graph |
| Capabilities | light, dark, reduced motion, forced colors, coarse pointer, no hover, and pseudo-RTL |
| Composed UI states | document dialog, session closeout, destructive confirmation, and graph detail |

The registry is test-only infrastructure, not a public route or production Vite
entry. `production-scenario.tsx` is an importable harness for the installed-tool
tests now and for a separately approved browser runner later.

## Existing-tool test lanes

`scripts/run-tests.mjs` has two explicit lanes:

1. Emitting TypeScript workspaces map `src/**/*.test.ts(x)` to their compiled
   `dist/**/*.test.js` files and run with Node's test runner. Missing or stale
   compiled counterparts fail discovery.
2. The no-emit `apps/desktop` workspace runs its discovered `.test.ts` and
   `.test.tsx` files directly with the repository-declared `tsx` loader. Those
   files are never added to the compiled lane. Any other no-emit workspace with
   tests still fails until it receives an explicit supported runner.

The lane covers production decoder behavior, store/runtime composition,
scenario completeness, privacy exclusion, async-state semantics, progress
semantics, form associations, and selection-control semantics using Node,
React's installed server renderer, and the already declared `tsx` transform.
Server-rendered component evidence checks static roles, names, states, and
associations; it does not claim focus, event, layout, browser, or assistive-
technology behavior.

Integrated validation commands (not evidence until actually executed):

```text
node node_modules/typescript/bin/tsc -b --force --pretty false
node scripts/run-tests.mjs
node --test scripts/desktop-contracts.test.mjs scripts/workstream-store.test.mjs
node scripts/check-frontend-fixtures.mjs
```

## Fixture reachability

`scripts/check-frontend-fixtures.mjs` walks the relative-import closure from
`apps/desktop/src/main.tsx` and fails if production can reach `src/testing` or a
test module. It also fails on fixture imports or scenario branches in production
source, direct effectful APIs in non-test fixture modules, fixture markers in
Vite configuration, the public website/documentation output, public-doc build
scripts, security documentation, Tauri capability/configuration files, and
fixture markers or the synthetic canary in an existing desktop build. The
check does not create a build and does not require one; CI runs it once against
source and again after the platform build so both conditions are covered.

## Deferred platform validation

The following evidence is intentionally not reported as passed. The required
tooling or platform is outside the currently approved dependency set or is a
physical/manual qualification surface.

| Status | Evidence | Exact command or procedure | Closure condition |
| --- | --- | --- | --- |
| `deferred_platform_validation` | Playwright critical journeys and responsive browser matrix | `node node_modules/@playwright/test/cli.js test --config apps/desktop/playwright.config.ts` | Run only after a separately owner-approved Playwright dependency and browser install provide the config and journeys. |
| `deferred_platform_validation` | Focused axe scans in a controlled frontend runtime | `ZHARWING_FRONTEND_TEST_URL=http://127.0.0.1:5174 node scripts/run-frontend-a11y.mjs` | Run only after separately approved `@playwright/test` and `axe-core` are present and the controlled runtime is available. The script exits with status 2 and a machine-readable deferral otherwise. |
| `deferred_platform_validation` | Rich DOM interaction, focus containment, inert background, keyboard event, and layout evidence | Re-run the approved frontend component suite under the future owner-approved DOM runner. | Record runner, dependency lock, and focused test report. |
| `deferred_platform_validation` | Screen reader | NVDA + current Edge: complete bootstrap, project switch, session, dialogs, forms, graph structured view, destructive confirmation, and recovery journey. | Record release candidate, OS/browser/NVDA versions, results, and defects. |
| `deferred_platform_validation` | Packaged WebView | On the pinned Windows/Rust/Tauri host, build the release candidate and run the packaged desktop core journey plus CSP/capability-denial checks. | Record artifact digest, WebView version, command transcript, and results. |
| `deferred_platform_validation` | Physical device and touch | On a physical small-screen touch device, exercise navigation, dialogs, forms, graph fallback, zoom, coarse pointer, and no-hover behavior. | Record device/browser/viewport, release candidate, and results. |

No dependency installation is authorized by this document. Dependency review,
lockfile change, browser provisioning, and release-device qualification remain
separate owner-approved work.
