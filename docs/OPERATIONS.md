# Operations

## Runtime Assumptions

The normal non-AI runtime should work without a model provider. Daemon startup,
CLI commands, MCP startup, sessions, docs, context preview, import, inbox,
backup, trash, search, and the saved Graph context map do not require LM Studio,
Ollama, llama.cpp, or a remote provider.

Current automated validation covers workspace TypeScript build-mode validation
and a deterministic test spine for privacy gates, Markdown storage round-trips,
context privacy integration, daemon lifecycle, graph overlays, semantic graph
policy, and fake-provider semantic graph analysis. Broad desktop end-to-end
coverage and automated tests against real AI provider processes are not yet
present.

The Vite production build uses native Rollup/esbuild optional packages. A
checkout shared between Windows and WSL must install dependencies in the same
operating system that will run the build; otherwise Vite can fail with a missing
or wrong-platform native package.

Native Tauri/Rust validation depends on a local Rust toolchain. Windows
`cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` has passed in
prior validation. A packaged desktop build has not been run.

## Environment Variables

Install dependencies, then copy `.env.example` to `.env` and choose a private
local memory root:

```text
corepack pnpm install
cp .env.example .env
```

Daemon:

```text
AIMEM_HOST=127.0.0.1
AIMEM_PORT=37841
AIMEM_AUTH_TOKEN=local-dev-token
AIMEM_MEMORY_ROOT=<memory-root>
```

`AIMEM_MEMORY_ROOT` stores private project memory, sessions, docs, imports,
context bundles, Memory Inbox proposals, and backups. Do not commit this folder.

API client:

```text
AIMEM_DAEMON_URL=http://127.0.0.1:37841
AIMEM_AUTH_TOKEN=local-dev-token
```

## Intended Startup

Daemon:

```text
corepack pnpm dev:daemon
```

CLI:

```text
corepack pnpm dev:cli projects
```

Browser UI:

```text
corepack pnpm dev:web
```

The React/Vite dev server is pinned to `http://localhost:5174` so it does
not collide with other local product runtimes that commonly use Vite's default
`5173`.

Desktop/web UI workflows currently include setup, project selection, project
delete, repo links, import preview/commit, workstreams, sessions, docs, search,
context preview, inbox, graph, backup management, and Trash restore/purge. The
browser UI calls the daemon API, so the daemon must be running first in browser
mode. The native Tauri desktop app starts or reuses the local daemon
automatically.

When opened as a native Tauri window, the Setup, Repositories, and Import
screens use OS folder pickers for path fields. Browser dev mode leaves those
Browse buttons disabled and keeps typed paths as the fallback, because ordinary
browsers cannot expose arbitrary absolute folder paths to web apps.

Use `corepack pnpm dev:web` for the browser app after
`corepack pnpm dev:daemon`. Use `corepack pnpm dev:desktop` for the native
Tauri window. The Tauri dev command starts or reuses the Vite app on port
`5174`, and the desktop shell starts or reuses the daemon on `127.0.0.1:37841`.

Native Tauri dev window:

```text
corepack pnpm dev:desktop
```

MCP:

```text
corepack pnpm dev:mcp
```

Installed client setup:

```text
aimem mcp install auto
aimem mcp doctor
```

Use HTTP MCP when the client can reach the daemon at
`http://127.0.0.1:37841/mcp`. Use stdio with `--transport stdio` when a client
needs to launch a local subprocess or when Windows/WSL localhost routing makes
the daemon URL unreachable. See [MCP Setup](MCP_SETUP.md).

The daemon and browser UI Vite commands have been run during validation. The native
Tauri command requires the local Rust/Tauri toolchain.

## Security

Production packaging should:

- generate a per-user local auth token
- store the token in the OS app data directory or keychain-compatible location
- bind daemon to localhost by default
- allow `AIMEM_AUTH_MODE=none` only for loopback-only personal setups
- keep remote access disabled by default
- require explicit approval for project creation, repo linking, context serving, and canonical memory writes only when review mode or safety policy requires it
- log sensitive operations without storing raw secrets

## Backups And Trash

Current backup behavior creates a directory snapshot under:

```text
<project-memory-root>/backups/snapshots/<timestamp>/
```

The backup function excludes the `backups/` subtree to avoid recursively copying snapshots into snapshots.

Future archive export can add `.zip` packaging once dependency or platform APIs are available.

Deleting a backup snapshot moves it to global Trash first. Trash metadata is
stored under:

```text
<memory-root>/global/trash/items/<trash-id>/trash-item.json
```

Path-backed items are moved below the same trash item directory. JSON-backed
items, such as linked repo entries, store their payload in the trash item
directory. Trash items can be restored until permanently purged.

## Indexing

Current index behavior writes:

```text
generated/index.json
```

The index is rebuildable from Markdown/frontmatter and JSON proposal files.

Future work:

- add SQLite registry/index database
- add SQLite FTS5 keyword search
- add rebuild-from-Markdown command with validation report

## Local Assistant

Current assistant behavior:

- status reporting
- recommended model metadata
- runtime install preview
- automatic close-session TLDR generation
- manual one-session TLDR generation
- bulk missing/all session TLDR generation
- deterministic return summary proposal
- deterministic document classification proposal

Not implemented yet:

- downloading llama.cpp
- downloading GGUF models
- starting llama-server
- GPU acceleration
- prompt logs
- remote session TLDR approval flow

## AI Provider Smoke Testing

Start LM Studio or another local OpenAI-compatible provider when testing
model-backed session TLDR generation, semantic graph relationship review, or
provider connectivity. It is not needed for normal validation or Graph context
map viewing.

Use [Testing With AI Providers](AI_TESTING.md) for the full runbook. The short
version is:

1. Start the daemon.
2. Start the provider and load a JSON-capable local model.
3. Configure the endpoint and model in **Settings -> Assistant**.
4. Run **Test provider** or `memory.check_semantic_graph_provider`.
5. Close a session or use **Work -> Sessions -> Generate TLDR** to test session
   summarization.
6. Open **Graph -> Details** and click **Run review**.
7. Inspect the Inbox proposal before accepting edges.

Dry-run mode, provider overrides, and document/candidate limits are available
under Graph Details **Advanced**.

## Validation Checklist For Future Runtime Work

1. Install dependencies.
2. Run `corepack pnpm typecheck`.
3. Run `corepack pnpm test`.
4. Run `corepack pnpm build` after dependencies are installed for the current OS.
5. Start daemon.
6. Initialize a temporary project.
7. Start a session.
8. Generate context preview.
9. Save checkpoint.
10. Close session.
11. Create inbox proposal.
12. Rebuild index.
13. Create backup snapshot.
14. Open desktop app.
15. Connect MCP adapter to a client.
16. If testing AI features, run the provider smoke checklist in
    [Testing With AI Providers](AI_TESTING.md).

## Known Constraints

- JSON index is a placeholder for SQLite/FTS5.
- MCP adapter is dependency-free and does not use the official SDK yet.
- Desktop UI uses hand-authored components instead of shadcn scaffolding.
- Runtime validation currently covers workspace TypeScript build-mode
  validation, privacy gates, Markdown storage round-trips, context privacy,
  daemon lifecycle, graph overlays, semantic graph policy, and fake-provider
  semantic graph analysis.
- The root test command runs a meaningful deterministic spine, but coverage
  remains narrow relative to the full testing plan.
- Real AI-provider tests are manual smoke tests; they are not part of the
  default automated test command.
- Native Tauri `cargo check` has passed through the Windows toolchain, but full Tauri dev smoke testing and packaging have not been completed.
- A packaged Windows desktop build has not been produced yet.
