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

- Tauri shell
- React UI
- MobX store
- Graphite + Copper CSS theme
- daemon API client

### Daemon

Location: `apps/daemon`

Role:

- owns project/session/context behavior
- exposes localhost JSON-RPC API
- applies privacy checks
- writes Markdown storage
- coordinates search, graph, backup, and assistant jobs

The daemon currently uses Node built-ins for HTTP and JSON-RPC so the source is present without dependency installation.

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

## Shared Packages

| Package | Responsibility |
| --- | --- |
| `@zharwing/memory-core` | Domain types, default policies, IDs, project model helpers |
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

The TypeScript workspace typechecks and the root test command runs a
deterministic spine covering privacy gates, Markdown storage round-trips,
context privacy integration, daemon lifecycle, graph overlays, semantic graph
policy, and fake-provider semantic graph analysis. Desktop contracts, bundle
budgets, a real Edge app-shell smoke, Rust tests, and a packaged Windows
executable have also passed. Runtime validation remains narrower than the full
product surface: broad desktop end-to-end coverage and configured live-provider
smokes are still opt-in work.

Vite build validation depends on native Rollup/esbuild optional packages being
installed for the operating system running the command. Shared Windows/WSL
checkouts should reinstall dependencies in the active environment before
treating build failures as product regressions.

## Remaining Productization Work

The dependency install, typecheck, test, production web build, daemon/CLI smoke
workflow, Rust check, and MCP doctor flow have been completed in the shared
Windows checkout. Remaining productization work is narrower:

1. Extend browser-level desktop UI coverage from the app-shell smoke to
   critical workflows.
2. Run the opt-in live-provider smoke for each supported deployment profile.
3. Add and smoke-test a Windows installer if distribution requires one; the
   release executable build already passes.
4. Decide whether the rebuildable JSON index remains sufficient or should be
   supplemented by SQLite/FTS5.
5. Treat app-managed llama.cpp download/launch as an optional future runtime,
   not a prerequisite for normal Zharwing Memory or MCP operation.
