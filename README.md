# AI Memory

AI Memory is a local-first project context manager for AI-assisted coding workflows. It is not the coding agent. External agents such as Codex, Claude Code, Gemini CLI, Ollama-based tools, LM Studio workflows, and future MCP-capable clients do the engineering work. AI Memory provides the durable local memory layer those agents can use safely.

The product keeps project knowledge, AI session history, context bundles, diagrams, decisions, commands, gotchas, and proposed memory updates organized per project. A human can open the desktop app to understand current work, review what context would be sent to an AI, inspect the graph, search previous work, and approve or reject proposed durable memory updates.

## Current Implementation Status

This repository is an implementation scaffold plus core business logic for the project plan in `../AI_MEMORY_SYSTEM_PLAN.md`.

Implemented:

- TypeScript monorepo layout.
- Local daemon API.
- CLI helper.
- MCP-style stdio adapter.
- Tauri + React desktop shell.
- Markdown-first storage model.
- Project registry and `.ai-memory.json` pointer support.
- Project-scoped sessions.
- Context bundle generation with inclusion/exclusion reasons.
- Privacy gates, visibility rules, secret redaction, and high-risk blocking.
- Memory Inbox proposals.
- Docs, diagrams, graph, search, backup snapshot, and rebuildable index boundaries.
- Optional local Memory Assistant boundary with deterministic reviewable jobs.

Not performed:

- No dependency installation.
- No test run.
- No typecheck.
- No build.
- No dev server launch.

Those constraints were intentional. Runtime validation remains pending until dependencies are installed and the project is executed.

## Product Principles

1. Project-scoped by default.
   Sessions, docs, graph, search, context, and startup state all resolve to the current project unless the user explicitly asks for all-project behavior.

2. Markdown is the source of truth.
   SQLite/FTS-style indexes are represented by rebuildable package boundaries. The current implementation uses dependency-free JSON indexes until native dependencies are allowed.

3. UI, CLI, and MCP share behavior.
   The daemon owns project/session/context logic. Adapters call the same API instead of reimplementing rules.

4. Privacy beats convenience.
   Context generation applies visibility rules, never-send rules, ignore patterns, secret scanning, redaction, blocking, and audit metadata.

5. Canonical memory is reviewed.
   External AI agents and the local Memory Assistant can propose updates, but canonical memory changes go through the Memory Inbox.

## Repository Layout

```text
apps/
  desktop/          Tauri + React human control plane
  daemon/           Localhost JSON-RPC daemon
  cli/              aimem command-line helper
  mcp-server/       MCP-style stdio adapter

packages/
  core/             Domain types, policies, IDs, defaults
  storage/          Markdown storage, registry, sessions, docs, inbox, backups
  privacy/          Visibility gates, patterns, secret scanning, redaction
  context-engine/   Bundle selection, reasons, token estimates, markdown rendering
  search/           Dependency-free keyword search boundary
  graph/            Derived relationship graph
  assistant-runtime/Optional local assistant boundary
  api-client/       Shared daemon API client
  mcp-tools/        MCP tool definitions and dispatch
  theme/            Graphite + Copper design tokens

docs/
  README.md         Documentation index
  ARCHITECTURE.md   System architecture
  DATA_MODEL.md     Entities, storage, and metadata
  API_REFERENCE.md  Daemon, CLI, and MCP surfaces
  USER_FLOWS.md     Human and agent workflows
  DIAGRAMS.md       Mermaid UML, ERD, sequence, state, flow diagrams
  OPERATIONS.md     Setup, runtime, backup, validation notes
```

## Architecture Summary

```text
Desktop UI     \
CLI             -> daemon API -> shared packages -> Markdown source of truth
MCP adapter    /                              \-> rebuildable indexes
```

The daemon owns:

- project detection
- project creation/linking
- session start/resume/list/checkpoint/close
- context bundle preview and generation
- privacy checks
- Memory Inbox proposals
- docs and diagrams
- search
- graph projection
- backup and validation
- optional assistant jobs

The desktop app, CLI, and MCP server are adapters.

## Memory Root Shape

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

Repos may contain:

```text
.ai-memory.json
```

That pointer file contains only project identity and memory location.

## Main Workflow

1. Create or link a project.
2. Start or resume a project-scoped session.
3. Preview the AI context bundle.
4. External AI performs coding work.
5. AI saves checkpoints after meaningful progress.
6. AI closes the session with next steps.
7. Durable memory proposals go to the Memory Inbox.
8. User accepts, edits, rejects, or defers proposals.

## CLI Examples

The CLI assumes the daemon is running.

```text
aimem init /path/to/repo --name "My App" --bootstrap AGENTS.md,CLAUDE.md
aimem projects
aimem status --project my-app
aimem start "Fix settings page save bug" --project my-app --agent codex
aimem sessions --project my-app
aimem context --project my-app --preview
aimem checkpoint --project my-app --session session-id "Implemented save flow"
aimem close --project my-app --session session-id "Save bug fixed"
aimem inbox --project my-app
aimem search --project my-app "settings save"
aimem graph --project my-app
aimem backup --project my-app
aimem validate --project my-app
aimem rebuild-index --project my-app
```

Assistant proposal examples:

```text
aimem assistant status --project my-app
aimem assistant summarize-session --project my-app --session session-id
aimem assistant return-summary --project my-app
aimem assistant classify-doc --project my-app --doc doc-id
```

## MCP Tool Families

The MCP adapter exposes project-scoped tools for:

- startup state
- project detection and creation
- sessions
- context bundles
- checkpoints
- close-session
- search
- docs
- Memory Inbox
- graph
- backups
- validation
- assistant proposals

See [API Reference](docs/API_REFERENCE.md) for the full list.

## Desktop UI

The desktop app is the human control plane. It includes:

- Projects
- Dashboard
- Current Work
- Sessions
- Docs Library
- Diagrams
- Graph
- Search
- Memory Inbox
- Context Preview
- Memory Assistant
- Backups
- Settings

The visual direction follows the Graphite + Copper theme from the product plan.

## Documentation

Start here:

- [Documentation Index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data Model](docs/DATA_MODEL.md)
- [API Reference](docs/API_REFERENCE.md)
- [User Flows](docs/USER_FLOWS.md)
- [Diagrams](docs/DIAGRAMS.md)
- [Operations](docs/OPERATIONS.md)
- [MVP Walkthrough](docs/MVP_WALKTHROUGH.md)

## Implementation Notes

- This project declares planned dependencies but they have not been installed.
- Mermaid diagrams are stored as Markdown and are intended to render in Mermaid-capable viewers.
- The assistant runtime currently provides deterministic jobs and model/runtime install previews. It does not download or run a model.
- The JSON index is a rebuildable placeholder for SQLite/FTS5 once native dependencies are allowed.
