# Frontend implementation and qualification matrix

Snapshot: 2026-08-12 documentation reconciliation.

`source_present` means the relevant implementation/check exists in source.
`local_pass` means the gate passed on the uncommitted 2026-08-12 working tree
with supported Node 24.19.0; it improves implementation confidence but is not
release evidence. `pass` is reserved for evidence bound to one branch, commit,
lockfile digest, profile, toolchain, artifact digest, command, exit code, and
timestamp. `deferred_platform_validation` means the check has not been run yet.
It is not a pass.

Local automated validation was run after the source-only reconciliation. It
does not create a release approval because the tree is uncommitted and native,
device, live-provider, installer, signing, and rollback gates remain open.

| Surface | Source observation | Candidate gate | Release/device gate |
| --- | --- | --- | --- |
| Contracts and clients | `source_present`: registered operations, runtime codecs, typed transports | `local_pass`: workspace TypeScript build and consolidated vectors; 331 passed, 0 failed, 2 intentional skips | commit-bound supported Node/pnpm evidence |
| Async state | `source_present`: project generations, cancellation, idempotency, reconciliation | `local_pass`: race, stale-result, polling, idempotency, and outcome-unknown vectors | offline/resume/reconnect soak |
| Browser authority | `source_present`: bootstrap, cookie/CSRF, rotation, project binding | `local_pass`: Host/Origin/session matrix; headless Edge confirmed the UI reports a missing daemon accurately at startup | live supported Chrome/Edge authority flow |
| Native desktop | `source_present`: Rust-owned daemon/credential and one invoke command | `local_pass`: six Rust unit tests plus Tauri compile/package mechanics with inert sidecar fixture | `deferred_platform_validation`: real packaged Windows WebView/daemon sidecar, signing, and installer smoke |
| Privacy and agent projection | `source_present`: schemas, visibility policy, result projection | `local_pass`: canaries, operation matrix, ownership races, and projection completeness | production-composed MCP daily loop |
| Provider egress | `source_present`: write-only secret store and destination policy | `local_pass`: non-exposure, DNS, redirect, private-address, and bounded-output vectors | approved loopback and remote provider smokes |
| Destructive effects | `source_present`: intents and frontend wrappers; confirmation bypass removed | `local_pass`: prepare/commit/cancel/replay/expiry/race vectors | disposable packaged destructive flow |
| Recovery and diagnostics | `source_present`: closed errors, layered boundaries, local diagnostics | `local_pass`: recovery contracts and headless Edge startup-recovery smoke | offline/locked/crash packaged flows |
| Accessibility | `source_present`: primitives, tokens, source checker, manual protocol | `local_pass`: source contract, 30 contrast pairs, semantic/keyboard/focus vectors | `deferred_platform_validation`: zoom/forced-colors, NVDA/VoiceOver/WebView/touch/physical device |
| Routing and graph | `source_present`: typed registry, recovery/focus, adapters, structured fallback | `local_pass`: route/graph and desktop contracts | deep-link/back-forward live browser and WebView flow |
| Public docs | `source_present`: generator/checker and progressive source | `local_pass`: 43 direct guides, default-visible navigation, bounded sanitized search | physical mobile/keyboard walkthrough |
| Artifacts and release | `source_present`: budgets, secret scan, evidence and SBOM scripts | `local_pass`: production build, unchanged budgets, source/fixture guards, isolated synthetic-secret scan; evidence/SBOM not promoted | signing, promotion, installer, rollback drill |
| Migration/compatibility | `source_present`: profile migration and dated register | `local_pass`: source and emitted reachability contracts | operator migration and rollback walkthrough |

## Required integrated order

1. Bind candidate identity and verify a clean source boundary.
2. Validate the V2 execution ledger with its canonical orchestrator.
3. Run source-artifact check, workspace typecheck, and deterministic tests.
4. Build/check generated public docs and run accessibility source checks.
5. Build browser assets; run budgets, fixture/forbidden-import, source-map, and
   secretless emitted-byte scans.
6. Generate evidence manifest and SBOM/checksums for those exact assets.
7. Run supported browser and Rust/Tauri gates.
8. Execute the declared manual assistive/device/profile/rollback matrix.
9. Record unavailable gates and unexpected skips without relabeling them.

## Claim rules

- **Source implementation complete:** integrated source is independently
  reviewed, every locally reproducible required gate passes, and all residual
  paths/gaps are explicit.
- **Release/device qualification complete:** every gate required for the
  selected release target passes against the same artifact and profile.
- A post-build or deployed smoke cannot replace a missing pre-release gate.
- Evidence from a rebuilt artifact, different profile, old lockfile, or older
  commit cannot be reused.

See [Testing](../TESTING.md), [Developer preview](../DEVELOPER_PREVIEW.md),
[Migration](../migration/frontend-v2-migration.md), and
[Compatibility register](../migration/frontend-v2-compatibility-register.md).
