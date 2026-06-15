# Architecture

AI Memory is a local-first project context manager for AI-assisted coding tools. The architecture has one important rule:

```text
UI, CLI, and MCP adapters do not own memory behavior.
They call the daemon.
The daemon calls shared packages.
Shared packages read and write Markdown source files.
```

## System Boundary

AI Memory is responsible for:

- registering projects
- linking repos to projects
- creating and resuming project-scoped sessions
- storing sessions, docs, diagrams, commands, gotchas, decisions, and proposed updates
- generating context bundles
- previewing exactly what will be sent to AI clients
- enforcing privacy, redaction, visibility, and never-send rules
- exposing MCP and CLI integrations
- maintaining rebuildable indexes and graph projections
- providing a desktop control plane
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

- human control plane
- project picker
- dashboard
- session management
- context preview
- inbox review
- docs, diagrams, graph, search
- backups and settings

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
- maps MCP tool calls to daemon RPC methods
- exposes prompt/resource text for startup and checkpoint behavior

The adapter is intentionally thin.

## Shared Packages

| Package | Responsibility |
| --- | --- |
| `@aimem/core` | Domain types, default policies, IDs, project model helpers |
| `@aimem/storage` | Markdown/frontmatter IO, registry, project workspace, sessions, docs, inbox, bundles, backups, index |
| `@aimem/privacy` | Visibility gates, ignore patterns, never-send patterns, secret scanning, redaction |
| `@aimem/context-engine` | Context selection, token estimates, inclusion/exclusion reasons, bundle Markdown |
| `@aimem/search` | Dependency-free keyword search boundary |
| `@aimem/graph` | Derived graph projection from metadata |
| `@aimem/assistant-runtime` | Optional local assistant boundary and deterministic proposal jobs |
| `@aimem/api-client` | Shared daemon RPC client |
| `@aimem/mcp-tools` | Tool definitions and dispatch |
| `@aimem/theme` | Graphite + Copper tokens |

## Storage Architecture

Markdown remains the durable source of truth. Indexes are rebuildable.

```text
AI Memory Root/
  global/
    projects.json
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
      docs/
      assets/
      generated/
      inbox/
      audit/
      backups/
```

Repo pointer:

```json
{
  "projectId": "project-slug",
  "memoryRoot": "D:/ai/llm-memory/projects/project-slug",
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

## Privacy Architecture

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

## Dependency Constraint

This implementation was authored without installing dependencies, running tests, running typecheck, building, or starting the app. Package manifests declare intended dependencies, but runtime validation is pending.

## Important Follow-Up Work

When dependency work is allowed:

1. Install dependencies.
2. Run typecheck.
3. Run tests.
4. Build packages.
5. Start daemon.
6. Run CLI smoke workflow.
7. Start desktop app.
8. Replace JSON index with SQLite/FTS5 where appropriate.
9. Wire official MCP SDK if desired.
10. Add real llama.cpp runtime management.
