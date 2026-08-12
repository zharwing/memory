# Frontend Implementation Blueprint V2

Status: repository-owned superseding campaign amendment

Authority: this document governs `EXECUTION/FRONTEND_V2_WORK_PACKAGES.json` and
`EXECUTION/FRONTEND_V2_IMPLEMENTATION_STATE.json`. It incorporates
`docs/FRONTEND_IMPLEMENTATION_BLUEPRINT.md` by reference for all requirements
that are not explicitly replaced here. It does not rewrite the sealed V1 plan,
package index, state history, snapshots, deltas, archives, or handoffs.

## 1. Why V2 exists

The V1 campaign successfully established and independently accepted its
baseline, typed operation boundary, and project-scope/resource-state model in
MEM-FE00 through MEM-FE02. MEM-FE03 then implemented principal separation,
browser cookie/CSRF authority, a shared registrar, centralized privacy
projection, safe public results, and daemon-owned session authority.

Adversarial review found requirements that cannot be completed inside the
sealed V1 package scopes:

- the shipped stdio MCP dispatcher and launcher live under
  `packages/mcp-tools`, `apps/mcp-server`, and `apps/cli`, outside MEM-FE03;
- crash-safe effect reconciliation needs atomic markers in the storage and
  context persistence owners, also outside MEM-FE03;
- native runtime selection, Tauri v2 command ACL generation, and daemon host
  composition require `main.tsx`, `src-tauri/build.rs`, generated permissions,
  daemon `index.ts`, and the desktop contract harness, outside MEM-FE04;
- a Rust/native host and Node daemon need an explicit cross-process desktop
  principal lifecycle, while globally-shaped trash/recovery operations need
  narrower resource authority.

The package index is hash-bound after work begins. Expanding it in place would
invalidate reviewed evidence. V2 therefore creates a new governed ledger,
adopts the exact V1 evidence, and continues without repeating accepted work.

## 2. Non-negotiable operating rules

The root Codex task is the persistent local campaign orchestrator. By explicit
owner direction on 2026-08-12, this is an implementation-first campaign: it
continues through the entire remaining source plan before running the integrated
test and qualification cycle. Package boundaries are internal ownership and
evidence checkpoints, not reasons to return, pause, or repeatedly qualify the
same cumulative tree.

- Keep at most one mutation package active across every implementation ledger
  in this repository.
- Acquire the package lease and seal its preimage before dispatch or mutation.
- During the source pass, do not run package-wide compilation, unit,
  integration, browser, packaged-runtime, or release tests. Run the complete
  integrated validation matrix once after every safe source package is
  implemented, then repair failures against that final composition.
- Read-only design review may run in parallel when it materially prevents
  incompatible implementations, but it must not become a per-package
  acceptance ceremony or stop the source pass.
- A provisional `implemented` package unlocks safe downstream local
  implementation. Final `accepted` status and independent review are completed
  during the single final qualification pass.
- Queue unavailable browser, WebView, device, signing, or release qualification
  honestly; continue all environment-independent source work.
- Stop only when no safe local package remains, a product decision changes the
  intended behavior, user-owned overlapping edits cannot be isolated, or an
  external/destructive action needs new authority.
- Do not install dependencies, read secrets/private Memory data, stage, commit,
  push, merge, publish, deploy, sign, rotate real credentials, or mutate remote
  services.

Snapshots, deltas, archives, handoffs, and contributor identities still bind
each source checkpoint to an exact working-tree preimage/postimage. These
lightweight checkpoints preserve ownership and rollback without rerunning
validation. Final review uses the complete cumulative candidate plus those
checkpoint chains.

## 3. Evidence adoption and supersession

`MEM-FEV2-00` binds the candidate after V1 MEM-FE03 is independently reviewed
and sealed as either accepted or provisional `implemented`. Its baseline record
must include the exact V1 state fingerprint and the immutable delta/archive and
review-handoff hashes for:

- MEM-FE00: accepted baseline and inventory;
- MEM-FE01: accepted typed frontend operation boundary;
- MEM-FE02: accepted project-scope/resource-state model;
- MEM-FE03: reviewed principal/privacy implementation, including every explicit
  repair obligation not yet accepted.

After MEM-FEV2-00 is accepted, V1 MEM-FE03 through MEM-FE11 are transitioned to
`superseded` with exact V2 successors. V1 MEM-FE00 through MEM-FE02 remain
accepted. Supersession preserves history; it never upgrades provisional work or
deletes prior evidence.

## 4. Package graph

| Package | Purpose | Dependencies |
| --- | --- | --- |
| MEM-FEV2-00 | Adopt V1 evidence and bind corrected scopes | none |
| MEM-FEV2-03R | Production MCP/agent wiring and crash-safe effect identity | V2-00 |
| MEM-FEV2-04 | Tauri/native authority, capabilities, secrets, paths, intents | V2-03R |
| MEM-FEV2-05 | Safe errors, recovery, sanitized diagnostics | V2-00 |
| MEM-FEV2-06 | Semantic tokens and accessible primitives | V2-05 |
| MEM-FEV2-07 | Typed routes and accessible graph boundary | V2-06 |
| MEM-FEV2-08 | Progressively enhanced public documentation site | V2-06 |
| MEM-FEV2-09 | Production-composed scenario/test foundation | V2-03R, V2-05, V2-06 |
| MEM-FEV2-10 | Performance, secretless build, artifact/release evidence | V2-04, V2-07, V2-08, V2-09 |
| MEM-FEV2-11 | Documentation, migration, final local qualification | V2-10 |

The machine-readable package index is authoritative for exact paths,
validation, evidence, rollback, and forbidden actions.

## 5. MEM-FEV2-03R: production agent and MCP repair

### 5.1 Authority delivery

HTTP MCP, stdio MCP, CLI, and direct agent RPC use a distinct project-bound
agent principal. They never reuse the preview admin token, browser cookie, or
desktop authority. Raw credentials are accepted only at a trusted host boundary
and immediately reduced to bounded digests; they never enter stdout/stderr,
project content, evidence, diagnostics, browser assets, or tool results.

The exact eleven daily-loop tools are derived from the operation registry.
Every production entrypoint passes through the same input decoder, registrar,
resource authorization, privacy projection, strict result decoder, and public
error algebra. Missing/wrong audience, project, version, method, expiry,
revocation, policy epoch, or operation is default-denied before service access.

### 5.2 Stable effect identity and reconciliation

Every required mutation derives one operation-bound idempotency key from the
original validated JSON-RPC request identity. Stdio framing, HTTP batches, CLI
adapters, retries, credential rotation, and daemon restart preserve it.

The durable effect identity is based on stable owner, project generation,
operation, caller key, and canonical decoded-input digest. Credential session,
rotation, expiry, and policy digest are authorization preconditions, not a new
logical effect identity.

The domain persistence owner atomically records a bounded effect marker with the
mutation whenever an after-effect crash could otherwise duplicate work.
Duplicate same-key/same-digest requests reconcile the authoritative domain
record and re-project under current policy. Same key/different digest is a
conflict. Claimed or unresolved ambiguity returns `outcome_unknown`; it is never
silently retried with a new key. Old projected response bytes are never replayed.

The journal is daemon-controlled, integrity protected, size bounded, link-safe,
outside project/backup content, and contains no raw key, input, private content,
credential, path, or projected response. Corruption, link substitution,
capacity exhaustion, and unresolved records fail closed.

### 5.3 Required hostile evidence

Tests cover the eleven-tool daily loop plus:

- missing, malformed, string/number-colliding, duplicate, and batch request IDs;
- same effect through HTTP, stdio, CLI, retry, rotation, and restart;
- concurrent duplicate, different-digest conflict, lost response, crash before
  effect, and crash after effect before response/receipt;
- wrong owner/project/generation/operation and expired/revoked authority;
- tightened policy after completion, proving fresh projection and no stale byte
  replay;
- corrupt, forged, linked, oversized, truncated, and raced journal state;
- synthetic credential/canary absence from source, logs, diagnostics, evidence,
  stdout/stderr, and emitted assets.

## 6. MEM-FEV2-04: native desktop repair

The packaged entrypoint selects the Tauri composition root. Rust owns daemon and
provider credentials; the webview receives only typed operation results and
safe public errors. A trusted native-host protocol registers/rotates a short-
lived desktop principal for the exact selected project, refuses an incompatible
preview daemon, and revokes authority on project switch, close, lock, or daemon
replacement.

Tauri v2 commands are registered in `build.rs`, represented in generated
permission manifests, and default-denied by capability. CSP is explicit and
least privilege. Path operations use native selection followed by server-side
canonical containment and link/race defenses.

Globally-shaped trash, restore, backup, provider, and permanent effects are not
authorized merely because a project ID is absent. Ordinary actions require an
exact project/resource binding; deleted-project recovery uses an expiring,
single-use, target-digest-bound recovery intent. Confirmation is never treated
as authorization.

## 7. Remaining frontend work

MEM-FEV2-05 through MEM-FEV2-11 retain the complete requirements of V1 F05-F11:
safe errors and layered recovery; local sanitized diagnostics; semantic tokens;
accessible primitives; keyboard/focus/zoom/forced-colors/reduced-motion truth;
one typed route authority; an accessible structured graph; progressive public
docs; production-composed fixtures; secretless builds; artifact budgets;
migration, compatibility removal, and honest final qualification.

Their corrected dependency graph is machine-enforced. Local implementation
completion and release/device qualification remain separate facts. No package
may launder a missing platform gate into a pass or use an unavailable broad
environment to stop unrelated safe source work.

## 8. Completion conditions

The source pass is complete when every V2 package has an immutable implemented
result and no safe source work remains. Only then does the root run the single
integrated validation/repair pass. The campaign is locally complete only when:

1. every V2 package has an immutable reviewed result and no safe source work is
   left unimplemented;
2. every required locally available validation passes on one bound candidate;
3. every frontend/agent/native/browser entrypoint is inventoried and raw bypass
   paths are private or source-and-emitted-byte banned;
4. privacy, authorization, idempotency, project isolation, recovery,
   accessibility, routing, performance, and artifact properties have exact
   positive, negative, mutant, and hostile evidence;
5. deferred platform/device/release gates and residual risks are explicit; and
6. no commit, push, deploy, publish, sign, credential rotation, or destructive
   external action has occurred without separate owner authorization.

Final handoff must distinguish `source implementation complete`, `local
qualification complete`, and `release/device qualification pending or
complete`. This campaign does not itself authorize a release.
