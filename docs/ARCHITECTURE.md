# Architecture

Zharwing Memory is a local-first project context manager for AI-assisted coding tools. The architecture has one important rule:

```text
UI, CLI, and MCP adapters do not own memory behavior.
They call the daemon.
The daemon calls shared packages.
Shared packages read and write Markdown source files.
```

## System Boundary

Zharwing Memory is responsible for:

- registering projects
- linking repos to projects
- creating and resuming project-scoped sessions
- storing sessions, docs, diagrams, commands, gotchas, decisions, and proposed updates
- generating context bundles
- previewing exactly what will be sent to AI clients
- enforcing privacy, redaction, visibility, and never-send rules
- exposing MCP and CLI integrations
- maintaining rebuildable indexes and graph projections
- providing a desktop interface
- running optional local assistant jobs

External AI agents are responsible for:

- understanding coding tasks
- reading and editing code
- debugging
- running tests
- implementing changes
- proposing memory updates

The local Memory Assistant is responsible only for memory maintenance jobs such as summaries, classification, return-to-project summaries, and proposal drafting.

## Runtime Components

### Desktop App

Location: `apps/desktop`

Role:

- human interface
- project switcher and project management
- dashboard
- repo linking
- session management, including human-controlled graph visibility
- workstream management
- context preview
- inbox review
- docs, diagrams, graph, search
- import preview/commit
- backups, Trash, and settings

Implementation:

- mutually exclusive browser and Tauri composition roots
- React UI with a generated typed route registry
- MobX domain stores behind typed operation ports and project-generation guards
- statically emitted Graphite + Copper semantic tokens and accessible primitives
- browser cookie/CSRF transport or Rust-owned Tauri transport; never a shared
  frontend bearer

The browser composition consumes a one-shot fragment bootstrap or the explicit
loopback `personal-preview + authMode=none` compatibility session. The Tauri
composition invokes one Rust command; Rust launches and owns the hardened
daemon, retains the desktop credential in native memory, and rotates it when
the project binding changes.

Route definitions, builders, navigation, parameter decoding, redirects,
wildcard recovery, and route-heading focus derive from one registry. URL
project changes are accepted only after the matching project generation is
current, preventing a stale route/project screen from mounting.

The desktop composition creates one runtime-owned graph of operation ports,
stores, project/application scopes, diagnostics, persistence adapters, and
invalidation transport. Screens borrow narrow feature state and actions; they
do not construct clients or coordinate document, semantic, assistant, or graph
work. `RootStore` remains a compatibility facade for existing UI call sites.

Project and document identifiers are decoded at operation, registry, pointer,
and route boundaries. Existing identifiers remain byte-for-byte readable;
normalization is limited to new project creation. Documents without stored IDs
use deterministic legacy identity derived from the exact project ID and
normalized relative path. Ordinary reads never materialize identity.

Graph layout, render capability, persistence, interaction state,
virtualization, semantic review, and structured accessibility are separate
adapters. The visual and structured views consume the same bounded projection;
the structured view remains functional when visual rendering is unavailable.

### Daemon

Location: `apps/daemon`

Role:

- owns project/session/context behavior
- exposes localhost JSON-RPC API
- applies privacy checks
- writes Markdown storage
- coordinates search, graph, backup, and assistant jobs

The daemon uses Node built-ins for HTTP and JSON-RPC. Its admission boundary
checks the registered operation, principal audience, project/resource scope,
compatibility version, runtime-decoded input, cancellation/deadline,
idempotency/effect class, and projected output. It exposes only closed public
errors; raw provider/daemon prose and stacks are not frontend output.

`personal-preview` remains the explicit compatibility default during the
migration window. `hardened-local` requires exact loopback and token/session
authentication, separate agent authority, browser cookie/CSRF sessions, and
native Rust-owned desktop authority. See
[Frontend V2 migration](migration/frontend-v2-migration.md).

### CLI

Location: `apps/cli`

Role:

- terminal helper for tools without MCP support
- project/session/context/checkpoint/search/backup workflows

The CLI calls the daemon API and does not duplicate business logic.

### MCP Adapter

Location: `apps/mcp-server`

Role:

- exposes agent-facing tools over stdio JSON-RPC
- shares MCP request handling with the daemon HTTP `/mcp` endpoint
- maps MCP tool calls to daemon behavior
- exposes prompt/resource text for startup and checkpoint behavior
- advertises only health, startup state, latest/recent sessions, session start,
  search, context preview/load, checkpoints, and closeout

The adapter is intentionally thin and focused. Project administration,
document editing, imports, graph settings, backups, and Trash remain in the UI,
CLI, and authenticated daemon administration API.

The daemon composition root selects the registry, document repository, session
authority, provider-secret owner, and other collaborators once, then injects
them into the compatibility `MemoryService` facade. Storage compatibility
functions delegate to repository owners, while graph projection and graph-rule
normalization live in `@zharwing/memory-graph`.

Operation dispatch is an exhaustive registry projection of the core operation
manifest. HTTP admission, RPC compatibility, privacy projection, and domain
services remain separate concerns; the handler registry only maps an admitted
operation to its single service owner. The daemon application owns one
`DocumentRepository` and one `SessionRepository` lifetime, including bounded
session-summary cache disposal.

## Shared Packages

| Package | Responsibility |
| --- | --- |
| `@zharwing/memory-core` | Domain types, default policies, validated IDs, operation/resource registry |
| `@zharwing/memory-store` | Markdown/frontmatter IO, registry, project workspace, sessions, docs, inbox, bundles, backups, Trash, index |
| `@zharwing/memory-privacy` | Visibility gates, ignore patterns, never-send patterns, secret scanning, redaction |
| `@zharwing/memory-context-engine` | Context selection, token estimates, inclusion/exclusion reasons, bundle Markdown |
| `@zharwing/memory-search` | Dependency-free keyword search boundary |
| `@zharwing/memory-graph` | Derived graph projection from metadata |
| `@zharwing/memory-semantic-graph` | Optional LLM-assisted relationship analysis, edge proposals, and review policy |
| `@zharwing/memory-assistant` | Optional local assistant boundary and deterministic proposal jobs |
| `@zharwing/memory-api-client` | Shared daemon RPC client |
| `@zharwing/memory-mcp` | Tool definitions and dispatch |
| `@zharwing/memory-theme` | Graphite + Copper tokens |

Cross-tab invalidation messages are versioned, body-free, project-scoped, and
bounded by event identity. BroadcastChannel is preferred in browser mode with
storage events as a fallback; focus/resume recovery remains authoritative when
an event is dropped. Physical preference keys, including
`aimem.graph.relationshipMode` and `aimem.graph.positions.d3.v2`, remain stable.

## Storage Architecture

Markdown remains the durable source of truth. Indexes are rebuildable.

```text
Zharwing Memory Root/
  global/
    projects.json
    trash/
  projects/
    <project-slug>/
      project.json
      overview.md
      architecture.md
      decisions.md
      tasks.md
      gotchas.md
      commands.md
      glossary.md
      privacy.md
      sessions/
      workstreams/
      docs/
      assets/
      generated/
      inbox/
      semantic-graph/
      audit/
      backups/
```

Repo pointer:

```json
{
  "projectId": "project-slug",
  "memoryRoot": "<memory-root>/projects/project-slug",
  "contextPolicy": {
    "directSessionInclusionDays": 7,
    "summaryOnlyDays": 30,
    "maxRawSessions": 3,
    "maxSummarizedSessions": 5
  }
}
```

## Context Pipeline

Context generation follows this pipeline:

1. Resolve project.
2. Resolve active or latest project session.
3. Load project-scoped sessions and docs.
4. Select canonical project docs.
5. Select active and recent relevant sessions.
6. Select pinned and task-relevant docs/diagrams.
7. Apply visibility rules.
8. Apply ignore and never-send patterns.
9. Scan for secrets.
10. Redact or block.
11. Estimate tokens.
12. Generate inclusion and exclusion reasons.
13. Render Markdown bundle.
14. Persist bundle and audit metadata when requested.

## AI Visibility And Secret Safety

Memory is AI-visible by default inside the selected project. Sessions, file
paths, and routine metadata are normal agent context; the privacy layer is an
explicit-exclusion and accidental-secret safety rail, not an approval gate for
ordinary memory access.

Visibility values:

- `ai-eligible`: can be included if relevant
- `ai-pinned`: intentionally included unless blocked
- `human-only`: visible in app, not sent to AI by default
- `private`: visible only to user, not sent to model contexts
- `never-send`: blocked from all AI/local-assistant prompts

Default blocked patterns include:

- `.env`
- `.env.*`
- private keys
- credentials
- secrets
- `.git/`
- `node_modules/`
- build outputs
- coverage
- caches

High-risk secrets block context. Lower-risk findings can be redacted.

## Project-Scoped Defaults

Default behavior is project-scoped everywhere:

- startup state
- sessions
- context bundles
- graph
- search
- docs
- diagrams
- inbox
- assistant jobs

All-project search should remain an explicit advanced mode.

Session history and graph projection are intentionally separate concerns. All
sessions remain stored and searchable, while the deterministic graph builder
projects only sessions with `include_in_graph: true`. The desktop UI
owns that opt-in; the focused MCP tool surface does not expose it.

## Current Validation Boundary

The uncommitted 2026-08-12 working tree passed the TypeScript workspace build,
333 automated tests with zero failures and two intentional Windows
symlink-safety skips, desktop contracts, the production web build and unchanged
bundle budgets, the isolated secret-canary build, fixture and source-artifact
guards, the accessibility source contract, generated public docs, and a
headless Edge startup-recovery smoke with the daemon deliberately absent. These
are local implementation results, not commit-bound release evidence. Six Rust
unit tests and the Tauri compile/package mechanics passed with an inert
external-binary fixture; the real daemon sidecar and packaged native runtime
remain unqualified. Broad desktop journeys, configured live
providers, assistive devices, installation/signing, and rollback also remain
release obligations.

Vite build validation depends on native Rollup/esbuild optional packages being
installed for the operating system running the command. Shared Windows/WSL
checkouts should reinstall dependencies in the active environment before
treating build failures as product regressions.

## Remaining Productization Work

The dependency install, workspace typecheck, deterministic tests, production
web build, source checks, public-doc checks, accessibility source checks, and
truthful no-daemon browser recovery smoke have been completed locally in the
shared Windows checkout. Remaining productization work includes:

1. Extend browser-level desktop UI coverage from startup recovery to critical
   workflows with a live daemon.
2. Run the opt-in live-provider smoke for each supported deployment profile.
3. Supply the governed daemon sidecar, run Rust tests, build and smoke-test the
   packaged Windows application, and validate installer/signing if distribution
   requires them.
4. Decide whether the rebuildable JSON index remains sufficient or should be
   supplemented by SQLite/FTS5.
5. Treat app-managed llama.cpp download/launch as an optional future runtime,
   not a prerequisite for normal Zharwing Memory or MCP operation.
