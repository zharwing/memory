# AI Memory

AI Memory is a local-first project context manager for AI-assisted coding workflows. It is not the coding agent. External agents such as Codex, Claude Code, Gemini CLI, Ollama-based tools, LM Studio workflows, and future MCP-capable clients do the engineering work. AI Memory provides the durable local memory layer those agents can use safely.

The product keeps project knowledge, AI session history, context bundles, diagrams, decisions, commands, gotchas, and optional review proposals organized per project. A human can open the desktop app to understand current work, review what context would be sent to an AI, inspect the graph, search previous work, and enable approval gates only when they want them.

## Current Implementation Status

This repository is the generic, project-neutral AI Memory application source.
Private user memory, project data, and personal workflows belong outside this
repo in each user's chosen memory store.

Implemented:

- TypeScript monorepo layout.
- Local daemon API.
- CLI helper.
- MCP-style stdio adapter.
- Tauri + React desktop shell.
- Markdown-first storage model.
- Project registry and `.ai-memory.json` pointer support.
- Project-scoped sessions and workstreams.
- Context bundle generation with inclusion/exclusion reasons.
- Privacy gates, visibility rules, secret redaction, and high-risk blocking.
- Optional Memory Inbox proposals for review-mode or risky updates.
- Docs, diagrams, graph, search, backup snapshot, and rebuildable index boundaries.
- Optional local Memory Assistant boundary with deterministic jobs and reviewable proposal support.
- Generic Markdown folder importer with preview/commit flow for existing memory and session corpora.
- Flexible named repository links with custom role/category metadata.
- Desktop/web first-run flow for project-only and single-repo setup.
- Recoverable delete flow with global Trash, restore, and permanent purge actions.
- Lightweight desktop navigation with project switcher, primary sections, and section tabs.
- Configurable project graph rules for mapping imported folder layouts to
  topics, services, packages, diagram groups, and code areas without hardcoded
  project names.

Validated in the current workspace:

- Dependencies installed with pnpm via Corepack.
- Workspace TypeScript build-mode validation passed.
- Desktop Vite production build passed.
- CLI dev entrypoint launched successfully.
- MCP stdio adapter initialized and listed tools successfully.
- Daemon and browser UI Vite dev server launched successfully.
- Native Tauri `cargo check` passed from the Windows toolchain.

Not yet performed:

- Meaningful unit/integration test coverage. The current root test command runs,
  but no compiled test files exist yet.
- Windows packaged `.exe` build.

## Product Principles

1. Project-scoped by default.
   Sessions, docs, graph, search, context, and startup state all resolve to the current project unless the user explicitly asks for all-project behavior.

2. Markdown is the source of truth.
   SQLite/FTS-style indexes are represented by rebuildable package boundaries. The current implementation uses dependency-free JSON indexes until native dependencies are allowed.

3. UI, CLI, and MCP share behavior.
   The daemon owns project/session/context logic. Adapters call the same API instead of reimplementing rules.

4. Privacy beats convenience.
   Context generation applies visibility rules, never-send rules, ignore patterns, secret scanning, redaction, blocking, and audit metadata.

5. Memory writes are direct by default.
   External AI agents can write routine session progress and durable project memory directly. Memory Inbox review is an optional project setting for teams that want approval gates or for risky/uncertain updates.

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
  AGENT_AUTOMATION.md MCP, bootstrap, and skill setup for agents
  USER_FLOWS.md     Human and agent workflows
  DIAGRAMS.md       Mermaid UML, ERD, sequence, state, flow diagrams
  OPERATIONS.md     Setup, runtime, backup, validation notes

templates/
  bootstrap/        Generic AGENTS.md and CLAUDE.md templates for linked repos
  mcp/              Generic Codex and Claude MCP config examples
  skills/           Generic AI Memory session skill template
```

## First Run

AI Memory separates application source code from private memory data.

```text
llm-memory/
  project/   app source code, safe to clone and version
  store/     private local memory data, do not commit
```

Other users should clone only the app source, then choose their own private
store path.

```bash
corepack pnpm install
cp .env.example .env
```

Edit `.env`:

```text
AIMEM_MEMORY_ROOT=<absolute-private-store-path>
AIMEM_AUTH_TOKEN=<local-random-token>
VITE_AIMEM_AUTH_TOKEN=<same-local-random-token>
```

Start the daemon and browser UI:

```bash
corepack pnpm dev:daemon
corepack pnpm dev:web
```

For the native desktop app, run:

```bash
corepack pnpm dev:desktop
```

The desktop shell starts or reuses the local daemon automatically. Browser mode
keeps the normal separate daemon + web server flow.

Open `http://localhost:5174/`, create a project, then link repos from
Repositories. For multi-repo products, create the project first and add each Git
repo root afterward.

### Pointer Files

A pointer file is a small `.ai-memory.json` file that AI Memory can write into a
linked Git repo. It lets tools opened from that repo detect the matching memory
project automatically.

Example:

```json
{
  "projectId": "my-project",
  "memoryRoot": "<absolute-path-to-private-memory-store>"
}
```

When creating a project with **Project only**, the preview shows
`Pointer file: disabled` because no repo is linked yet. Create the project first,
then open Repositories, link each repo root, and leave pointer files enabled if
you want agents and CLI tools to auto-detect the project from those repos.

To migrate existing Markdown memory, open Import after selecting the project.
Use **Memory Docs** for old MEMORY folders, **Session History** for old SESSIONS
folders, and **Mixed Workspace** when one folder contains both. Preview first;
commit only after the counts and sample rows look right.

After importing, use Graph Rules when the imported folder layout should create
context hubs in the Graph page. Open **Settings -> Project -> Graph Rules** and
save a JSON array such as:

```json
[
  { "match": "apps/*", "nodeType": "package", "topic": "frontend" },
  { "match": "services/*", "nodeType": "service", "topic": "backend" }
]
```

This is project configuration, not application hardcoding. AI Memory matches
rules against imported relative paths and derives context graph nodes from them.
Use Graph for memory relationships; use Diagrams for runtime architecture and
service dependencies. See [Graph Rules](docs/GRAPH_RULES.md) for the full manual
and AI/MCP workflow.

Never commit the memory store. It contains project sessions, docs, imports,
context bundles, Memory Inbox proposals, and backups.

Deletion is recoverable by default. Projects, linked repo entries, workstreams,
sessions, docs, inbox proposals, and backups move to Trash first. Trash supports
restore, single-item permanent delete, selected permanent delete, and full empty.

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
- trash, restore, and permanent purge
- optional assistant jobs

The desktop app, CLI, and MCP server are adapters.

## Memory Root Shape

The memory root is private per-user state. It can live anywhere on the local
machine and is configured with `AIMEM_MEMORY_ROOT`.

```text
AI Memory Root/
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
      audit/
      backups/
```

Repos may contain:

```text
.ai-memory.json
```

That pointer file contains only project identity and memory location.
Because the memory location is machine-local, `.ai-memory.json` is ignored by
this app repo by default. Teams can decide separately whether pointer files in
their own linked repos should be committed or kept local.

## Main Workflow

1. Create or link a project.
2. Read the latest relevant previous session.
3. Start a fresh project-scoped session for the current day or work round.
4. Preview the AI context bundle.
5. External AI performs coding work.
6. AI saves checkpoints after meaningful progress.
7. AI closes the session with next steps.
8. AI writes durable memory directly when review mode is off.
9. Review-mode or risky updates go to the Memory Inbox for accept/edit/reject/deferral.

## Agent Automation

For automatic session behavior in Codex, Claude, or local agents:

1. Start the daemon.
2. Register the MCP adapter using `templates/mcp/`.
3. Link source repos from the UI or CLI.
4. Generate repo bootstrap files from `templates/bootstrap/`.
5. Optionally install `templates/skills/ai-memory-session` as a generic Codex
   skill or translate it into another agent's custom instruction format.

Agents should call `memory.get_startup_state`, read the latest previous session,
start a fresh daily/work-round session, search memory, load context when useful,
save checkpoints during work, and close or checkpoint at the end. See
[Agent Automation](docs/AGENT_AUTOMATION.md).

## CLI Examples

The CLI assumes the daemon is running.

```text
aimem init <repo-root> --name "My App" --bootstrap AGENTS.md,CLAUDE.md
aimem projects
aimem status --project my-app
aimem repos --project my-app
aimem link-repo <repo-root> --project my-app --name "Service API" --role service
aimem create-workstream "Huddle" --project my-app --topic huddle,realtime
aimem workstreams --project my-app
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
aimem import-profiles
aimem import-folder <source-memory-folder> --project my-app --profile markdown-memory
aimem import-folder <source-sessions-folder> --project my-app --profile markdown-sessions --commit
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
- multi-repo project links
- workstreams
- sessions
- context bundles
- checkpoints
- close-session
- search
- docs
- import profiles and folder import
- Memory Inbox
- graph and graph rules
- backups
- trash and restore
- validation
- assistant proposals

See [API Reference](docs/API_REFERENCE.md) for the full list.

For AI clients, graph changes should normally be proposed through
`memory.propose_graph_update` so a human can review them in the Memory Inbox.
Use `memory.update_graph_rules` only after explicit user approval or from a
manual settings action.

## Desktop UI

The desktop app is the human control plane. The sidebar stays intentionally
small:

- project switcher for selecting, creating, and deleting projects
- Dashboard
- Repos
- Work
- Library
- Import
- Search
- Trash
- Settings

Secondary pages live inside section tabs:

- Work: Current Work, Sessions, Workstreams
- Library: Docs, Diagrams, Inbox, Graph, Context
- Settings: Project, Setup, Assistant, Backups

In the native Tauri desktop window, Setup, Repositories, and Import provide
Browse buttons for selecting folders with the OS file picker. Browser dev mode
keeps typed paths as a fallback because browsers do not expose arbitrary local
folder paths to web apps.

See [Desktop UI](docs/DESKTOP_UI.md) for the current navigation and first-run
flow.

The visual direction follows the Graphite + Copper theme from the product plan.

## Documentation

Start here:

- [Documentation Index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data Model](docs/DATA_MODEL.md)
- [API Reference](docs/API_REFERENCE.md)
- [User Flows](docs/USER_FLOWS.md)
- [Desktop UI](docs/DESKTOP_UI.md)
- [Graph Rules](docs/GRAPH_RULES.md)
- [Diagrams](docs/DIAGRAMS.md)
- [Operations](docs/OPERATIONS.md)
- [MVP Walkthrough](docs/MVP_WALKTHROUGH.md)

## Implementation Notes

- Dependencies have been installed in this checkout.
- Mermaid diagrams are stored as Markdown and are intended to render in Mermaid-capable viewers.
- The assistant runtime currently provides deterministic jobs and model/runtime install previews. It does not download or run a model.
- The JSON index is a rebuildable placeholder for SQLite/FTS5 once native dependencies are allowed.
