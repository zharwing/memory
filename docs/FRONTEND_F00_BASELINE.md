# Frontend F00 baseline

**Purpose:** completion record for frontend campaign package
`MEM-FE00`. This document records the candidate decisions and inventory
that make F01-F11 executable. It does not itself mutate state, claim a release,
or alter private Memory data; state transitions occur only through the
repository orchestrator.

## Candidate identity and authority

- Candidate branch: `feat/refactor-v1`.
- Candidate commit: `ba5ae3cc17c65594f9815487b8caa00cfc335a48`.
- Candidate Git upstream: none. `origin/main` is the intended integration
  target, not a configured tracking branch for this candidate.
- Worktree status before creation of this record: clean. The campaign
  documentation/state files created afterward are expected candidate changes,
  not baseline drift.
- Audit-time main execution-plan fingerprint:
  `sha256:b770f976b962324c49204739a3274fbf50e670a47adc0401e1b2644e1fc9a2cb`.
- Frontend campaign plan fingerprint: computed from
  `docs/FRONTEND_IMPLEMENTATION_BLUEPRINT.md` and bound in
  `EXECUTION/FRONTEND_IMPLEMENTATION_STATE.json` by the guarded
  orchestrator `baseline` command.
- Frontend package-index fingerprint: computed from
  `EXECUTION/FRONTEND_WORK_PACKAGES.json` and bound by the same command.
- Runtime/filesystem validation owner: the strongest safe local repository
  toolchain during implementation; the exact declared Windows/Node/pnpm,
  browser, and packaged-WebView environments remain F10/F11 qualification
  owners.
- State authority: the repository orchestrator with
  `EXECUTION/FRONTEND_WORK_PACKAGES.json` and
  `EXECUTION/FRONTEND_IMPLEMENTATION_STATE.json`. Neither ledger is
  manually edited by this record.

The current branch is the human-selected candidate branch. The frontend ledger
starts with F00 `pending` and null plan/package-index bindings. After
validation proves the selected sources and every sibling ledger has no active
package, the root orchestrator binds this candidate through
`orchestrate.py baseline`, promotes F00 to `ready`, records its
base-commit/current-tree snapshot delta, performs the internal review/state
transition, and immediately begins `MEM-FE01`. Accepted `MEM-P00` is
architectural traceability and is not reopened. Later plan/package/base-commit
drift is not rebound over sealed evidence.

## Product-profile decision

Two explicit profiles are retained:

| Profile | Status | Boundary |
| --- | --- | --- |
| `personal-preview` | Current compatibility profile | One trusted local user, loopback operation, token authentication by default, selected-project memory AI-eligible by default subject to visibility and secret policy, and direct routine writes when project policy allows. |
| `hardened-local` | Future opt-in target | Separate browser, desktop, agent, provider, backup, and administrative authority; project-bound least privilege; explicit import-safe visibility; proposal-governed durable knowledge; browser session credentials; and versioned migration/rollback. |

No profile migration, default-policy change, credential change, store migration,
or private-data operation is part of F00. The profile distinction is governed
by `docs/DEVELOPER_PREVIEW.md` until the later authoritative packages implement
the hardened profile.

## Support floor and non-goals

- Language/direction: English, left-to-right. Formatting, pseudo-RTL fixtures,
  and locale ownership are future F06 work.
- Packaged desktop support target: supported Windows WebView2 release at a
  980 × 720 minimum window, including keyboard-only operation.
- Local browser target: current and previous Chrome/Edge on Windows at 390,
  820, 980, and 1440 CSS pixels, including 200% zoom.
- Public site/documentation target: current and previous Chrome, Edge,
  Firefox, and Safari at 320–1920 CSS pixels, with essential content available
  without JavaScript.
- No analytics, session replay, autocapture, or third-party telemetry is
  introduced. Diagnostics remain local, bounded, and sanitized when F05
  implements them.
- F00 does not authorize hosted access to a private store, multi-user accounts,
  offline mutation queues, realtime delivery, cross-tab payload sharing, a
  framework/state-management replacement, a CSS-in-JS migration, a separate
  design-system product, SSR for the private app, or full translation.

## Current frontend inventory

### Runtime boundaries

| Boundary | Current implementation | F00 finding |
| --- | --- | --- |
| Browser/desktop client | `packages/api-client/src/index.ts` exposes public generic `call()` and `callAgent()` methods and reads daemon URL/token values from runtime environment variants. | Raw string calls, bearer transport, result casts, and error conversion are centralized but not runtime-decoded or audience-separated. |
| React application | `apps/desktop/src/App.tsx`, `stores/`, `screens/`, and `components/`. | Route declarations and helpers are duplicated; most scoped stores retain their own request/commit behavior. |
| Tauri shell | `apps/desktop/src-tauri/src/lib.rs`, `tauri.conf.json`, and `Cargo.toml`. | The shell reads daemon startup configuration, launches/reuses the daemon, enables dialog and shell plugins, and declares no CSP. |
| Daemon | `apps/daemon/src/server.ts`, `rpc.ts`, `agent-facade.ts`, and services. | The administrative `/rpc` and agent `/agent-rpc` surfaces share the current token configuration; later packages must separate principals and admission. |
| Public site | `website/memory/index.html`, `script.js`, and `styles.css`. | Landing content is static, but documentation is a JavaScript-switched portal. |
| Documentation portal | `website/memory/docs/index.html`, `docs.js`, and `docs.css`. | Guides are embedded in one document, with hidden articles selected at runtime rather than direct static guide pages. |

### Desktop-facing operations

The following current control-plane operation groups are called by desktop
stores or the shared client. This is an inventory, not an allowlist:

| Area | Operations |
| --- | --- |
| Startup, projects, and repositories | `get_startup_state`, `list_projects`, `get_project_summary`, `prepare_project_creation`, `create_project`, `delete_project`, `list_project_repos`, `link_repo`, `unlink_repo`, `delete_repo`, `update_memory_write_policy` |
| Sessions and workstreams | `list_project_sessions`, `get_session_detail`, `start_session`, `close_session`, `close_stale_sessions`, `save_checkpoint`, `delete_session`, `update_session_graph_visibility`, `generate_session_summary`, `generate_session_summaries`, `list_workstreams`, `get_workstream_detail`, `create_workstream`, `update_workstream_status`, `delete_workstream` |
| Documents, inbox, graph, and context | `list_docs`, `update_doc`, `delete_doc`, `search`, `list_inbox`, `update_inbox_status`, `delete_inbox_item`, `get_graph`, `update_graph_rules`, `preview_context_bundle`, `get_context_bundle` |
| Semantic graph and assistant | `get_semantic_graph_settings`, `update_semantic_graph_settings`, `get_semantic_graph_status`, `list_semantic_edges`, `update_semantic_edge_status`, `list_semantic_graph_runs`, `get_semantic_graph_run`, `preview_semantic_graph_analysis`, `analyze_semantic_graph`, `propose_semantic_edges`, `accept_semantic_edges_proposal`, `assistant_status`, `update_assistant_policy`, `check_semantic_graph_provider` |
| Imports, backup, and trash | `list_import_profiles`, `prepare_import`, `commit_import`, `list_backups`, `backup_project`, `delete_backup`, `list_trash`, `restore_trash_item`, `purge_trash_item`, `empty_trash` |
| System/MCP | `health`, `mcp_doctor`, `mcp_install` |

The daemon’s broader registrar also exposes document creation/import,
project detection/validation, manifest/index operations, return summaries, and
proposal operations. F01 establishes a complete typed registry; F03 separates
admission and projection before any frontend authority claims change.

### Routes, stores, scoped resources, and destructive effects

- Routes currently cover setup, projects, dashboard, repositories, current
  work, sessions, workstreams, docs, diagrams, inbox, graph, context, import,
  search, project settings, assistant settings, backups, and Trash; each has
  legacy and project-scoped forms where applicable.
- The root store refreshes sessions, docs, workstreams, inbox, graph, semantic
  graph, assistant, backups, imports, and Trash around the selected project.
  Workstreams already includes a local guarded-commit pattern; the remaining
  scoped stores do not share one generation/cancellation coordinator.
- Project-scoped resources include project summary/repositories, sessions and
  session detail, workstreams and detail, documents/search, inbox, graph and
  semantic graph, assistant/context, imports, backups, and project mutations.
- Recoverable delete/move-to-Trash paths include projects, repositories,
  workstreams, sessions, documents, inbox items, and backups. Permanent or
  consequential paths include purge/empty Trash, restore over a current target,
  unlinking with pointer removal, import commit, policy changes, provider
  configuration checks, and semantic proposal acceptance. Current confirmation
  behavior is client preference-based and is not a server-owned intent.
- Credential flows currently include daemon token configuration, a browser
  client bearer header, daemon token-file resolution, and desktop startup
  configuration. Provider-secret UI is present in the assistant screen. F03
  and F04 own their replacement; F00 does not inspect values or private files.

## Slice-to-package and owner map

The continuous root Terra task owns campaign progress. It assigns one
`MEM-FE*` mutation package at a time, uses a fresh-context independent
reviewer where required, records the internal checkpoint, transitions state
through the orchestrator, and continues to the next eligible package. The
frontend state ledger remains the live source of truth.

| Slice | Authoritative package | Cross-plan traceability only | Prerequisite / scope note |
| --- | --- | --- | --- |
| F00 | `MEM-FE00` | accepted `MEM-P00` | Baseline, profiles, inventory, and executable campaign map; complete in this record. |
| F01 | `MEM-FE01` | `MEM-P01`, `MEM-P11` | Runtime contracts, composition roots, and typed client after F00. |
| F02 | `MEM-FE02` | `MEM-P01`, `MEM-P04`, accepted `MEM-P00V` | Project scope and async state after F01. |
| F03 | `MEM-FE03` | `MEM-P02`, `MEM-P03`, `MEM-P12` | Principal separation and privacy projection; sensitive independent review. |
| F04 | `MEM-FE04` | `MEM-P13`, `MEM-P02`, `MEM-P03`, `MEM-P12` | Tauri authority, capabilities, secrets, and destructive intents after F03. |
| F05 | `MEM-FE05` | `MEM-P01`, `MEM-P03`, `MEM-P14` | Safe errors, recovery, and bounded diagnostics after contract/scope foundations. |
| F06 | `MEM-FE06` | `MEM-P13`, `MEM-P14` | Semantic tokens and accessible primitives after F05. |
| F07 | `MEM-FE07` | `MEM-P14` | Typed routes and graph decomposition after F02 and F06. |
| F08 | `MEM-FE08` | `MEM-P00R`, `MEM-P14` | Static progressively enhanced public site/docs; exact prerequisites are in the package index. |
| F09 | `MEM-FE09` | `MEM-P11`, `MEM-P14` | Scenario/test foundation with installed tools; unapproved dependency/platform checks become qualification debt. |
| F10 | `MEM-FE10` | `MEM-P14`, `MEM-P15` | Performance, build, and candidate-evidence implementation; exact-platform gaps remain qualification debt. |
| F11 | `MEM-FE11` | `MEM-P14`, `MEM-P15` | Documentation, migration, and final reconciliation of all qualification obligations. |

## F00 completion boundary

This record completes the F00 documentation and inventory deliverables for the
current candidate. It deliberately does **not** edit execution state by hand.
The root repository orchestrator must:

1. validate the frontend package/state pair;
2. bind the plan fingerprint, package-index fingerprint, and candidate with the guarded
   `baseline` command;
3. transition initially pending `MEM-FE00` to `ready`;
4. capture the baseline-commit and current-tree snapshots plus the guarded F00
   delta;
5. obtain the internal independent review required by `MEM-FE00`;
6. transition `MEM-FE00` to accepted, or to provisional
   `implemented` if no separate reviewer runtime exists; and
7. immediately start `MEM-FE01` in the same user task.

A null fingerprint, unavailable Memory daemon, missing package-manager wrapper,
or unavailable candidate-only platform check does not invalidate this
inventory. Record the affected validation honestly, use a safe exact
package-script expansion when available, and retain exact Windows/browser/
WebView evidence as F10/F11 qualification debt. Do not reopen accepted
`MEM-P00`, wait for a governed continuation, or return to the user between
F00 and F01.
