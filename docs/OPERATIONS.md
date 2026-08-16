# Operations

## Runtime Assumptions

The normal non-AI runtime should work without a model provider. Daemon startup,
CLI commands, MCP startup, sessions, docs, context preview, import, inbox,
backup, trash, search, and the saved Graph context map do not require LM Studio,
Ollama, llama.cpp, or a remote provider.

The uncommitted 2026-08-12 working tree passed the workspace typecheck, 333
automated tests with zero failures and two intentional Windows symlink-safety
skips, the production web build and unchanged bundle budgets, isolated
secret-canary, fixture, source-artifact, accessibility-source, and public-doc
checks, plus a headless Edge smoke confirming the UI reports a missing daemon
accurately at startup. Those local
results are not commit-bound release evidence. Six Rust unit tests and the
Tauri compile/package mechanics passed with an inert sidecar fixture, but the
production daemon/runtime, live-provider, assistive-device, installer/signing, and rollback
gates also remain open for an exact candidate.

The Vite production build uses native Rollup/esbuild optional packages. A
checkout shared between Windows and WSL must install dependencies in the same
operating system that will run the build; otherwise Vite can fail with a missing
or wrong-platform native package.

Native Tauri/Rust validation depends on a local Rust toolchain. A candidate
release executable is written to
`apps/desktop/src-tauri/target/release/zharwing-memory-desktop.exe`; its build,
installer, signing, and device smoke must be proven for that exact candidate.

## Environment Variables

Install dependencies, then create a private, untracked `.env` and choose a
private local memory root. Do not copy retired browser settings into a new
configuration:

```text
corepack pnpm install
```

Daemon:

```text
ZHARWING_MEMORY_HOST=127.0.0.1
ZHARWING_MEMORY_PORT=37841
ZHARWING_MEMORY_ROOT=<memory-root>
ZHARWING_MEMORY_AGENT_SURFACE=enabled
ZHARWING_MEMORY_DESKTOP_AUTOSTART_DAEMON=true
```

`ZHARWING_MEMORY_ROOT` stores private project memory, sessions, docs, imports,
context bundles, Memory Inbox proposals, and backups. Do not commit this folder.

API client:

```text
ZHARWING_MEMORY_DAEMON_URL=http://127.0.0.1:37841
```

Normal `personal-preview` mode needs no token. When advanced token mode or
`hardened-local` is selected and `ZHARWING_MEMORY_AUTH_TOKEN` is unset, the
daemon generates a random per-user token and stores it in the OS user state directory
(`%APPDATA%\zharwing-memory\daemon-token` on Windows, `$XDG_STATE_HOME` or
`~/.local/state/zharwing-memory/daemon-token` on POSIX). Delete the file to
rotate the token. Never commit a real token or use a placeholder token outside
local development.

Optional desktop-shell overrides use
`ZHARWING_MEMORY_DESKTOP_PROJECT_ROOT`,
`ZHARWING_MEMORY_DESKTOP_DAEMON_COMMAND`, and
`ZHARWING_MEMORY_DESKTOP_AUTOSTART_DAEMON`. Canonical
`ZHARWING_MEMORY_*` variables always win. The previous `AIMEM_*` names remain
fallback-only for one compatibility window.

## Rename Compatibility

New configuration, generated MCP files, logs, schemas, skill metadata, and
runtime metadata use the Zharwing Memory name. A small set of legacy identifiers
is retained deliberately so existing installations do not lose data or become
separate applications:

- `AIMEM_*` environment variables are read only as deprecated fallbacks.
- `aimem` remains a CLI alias during the transition.
- `.ai-memory.json` remains a readable legacy pointer filename.
- `AI Memory Root`, `local.aimem.desktop`, and existing `aimem.*` browser
  storage keys remain stable compatibility identifiers.

Do not use those legacy identifiers in new examples or generated configuration.

## Intended Startup

Daemon:

```text
corepack pnpm dev:daemon
```

CLI:

```text
corepack pnpm dev:cli projects
```

### Local Browser UI

The browser UI is a full local interface for daily use. Start the daemon and
UI together:

```text
corepack pnpm dev
```

Open `http://127.0.0.1:5174/`. The React/Vite dev server is pinned to that port so it does
not collide with other local product runtimes that commonly use Vite's default
`5173`.

Normal local use requires no token, launcher, or profile setup. See
[Browser UI](WEB_UI.md).

Desktop/web UI workflows currently include setup, project selection, project
delete, repo links, import preview/commit, workstreams, sessions, docs, search,
context preview, inbox, graph, backup management, and Trash restore/purge. The
browser UI calls the daemon API, so the daemon must be running first in browser
mode. The native Tauri host refuses an unrelated healthy daemon. It starts and
owns an exact-loopback hardened daemon, exchanges a one-shot desktop
credential outside the webview, and rotates the daemon/principal when project
binding changes. A packaged executable needs its sidecar or an explicit trusted
`ZHARWING_MEMORY_DESKTOP_DAEMON_COMMAND`.

When opened as a native Tauri window, the Setup, Repositories, and Import
screens use OS folder pickers for path fields. Browser dev mode leaves those
Browse buttons disabled and keeps typed paths as the fallback, because ordinary
browsers cannot expose arbitrary absolute folder paths to web apps.

Use `corepack pnpm dev` for the browser app. Use `corepack pnpm dev:desktop` for the native
Tauri window. The Tauri dev command starts or reuses the Vite app on port
`5174`; the Rust desktop host owns its daemon on `127.0.0.1:37841`.

Native Tauri dev window:

```text
corepack pnpm dev:desktop
```

Packaged desktop build:

```text
corepack pnpm build:desktop
```

On Windows this produces
`apps/desktop/src-tauri/target/release/zharwing-memory-desktop.exe`. The current
repository config does not build an installer.

MCP:

```text
corepack pnpm dev:mcp
```

Installed client setup:

```text
zharwing-memory mcp install auto
zharwing-memory mcp doctor
```

Use HTTP MCP when the client can reach the daemon at
`http://127.0.0.1:37841/mcp`. Use stdio with `--transport stdio` when a client
needs to launch a local subprocess or when Windows/WSL localhost routing makes
the daemon URL unreachable. See [MCP Setup](MCP_SETUP.md).

The daemon and browser UI commands are source entry points, not validation
evidence. The native Tauri command requires the local Rust/Tauri toolchain.

## Security

Current daemon behavior:

- generates a per-user local auth token only when advanced token mode is active
  and no token was supplied, storing it with restrictive permissions
- binds to localhost by default

Production packaging should additionally:

- allow `ZHARWING_MEMORY_AUTH_MODE=none` only for loopback-only personal setups
- keep remote access disabled by default
- require confirmation for project creation, repo linking, and destructive
  administrative operations
- serve selected-project memory to AI by default without per-request approval;
  keep explicit visibility exclusions, never-send patterns, and secret checks
- route canonical memory writes through review only when the project enables
  review mode or the update is risky or uncertain
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

Current index behavior writes a versioned project manifest:

```text
generated/index.json
```

The index includes its schema version, generation time, collection counts, and
compact record projections. It is rebuildable from Markdown/frontmatter and
JSON proposal files and is the supported default for normal project sizes.

Optional scaling work:

- add SQLite registry/index database
- add SQLite FTS5 keyword search
- extend the existing `rebuild-index` command with a richer validation report

## Local Assistant

Current assistant behavior:

- status reporting
- recommended model metadata
- automatic close-session TLDR generation
- manual one-session TLDR generation
- bulk missing/all session TLDR generation
- deterministic return summary proposal
- deterministic document classification proposal

Deliberately out of scope:

- downloading or launching llama.cpp
- downloading GGUF models
- managing GPU acceleration
- prompt logs
- remote session TLDR approval flow

The UI supports configured LM Studio, Ollama, llama.cpp server, OpenAI,
Anthropic, and custom OpenAI-compatible endpoints. It does not advertise an
app-managed download/runtime path. Persisted legacy `app-managed-llamacpp`
settings remain readable and show a migration message.

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
2. Run `corepack pnpm check:source-artifacts`.
3. Run `corepack pnpm typecheck`.
4. Run `corepack pnpm test` (compiles from clean and fails on zero tests).
5. Run `corepack pnpm build` after dependencies are installed for the current OS.
6. Run `corepack pnpm check:source-artifacts` again to confirm no build wrote
   output into a `src` directory.
7. Start daemon.
8. Initialize a temporary project.
9. Start a session.
10. Generate context preview.
11. Save checkpoint.
12. Close session.
13. Create inbox proposal.
14. Rebuild index.
15. Create backup snapshot.
16. Open desktop app.
17. Connect MCP adapter to a client.
18. If testing AI features, run the provider smoke checklist in
    [Testing With AI Providers](AI_TESTING.md).

## Known Constraints

- The JSON project manifest is the supported default. SQLite/FTS5 remains an
  optional scaling layer for very large stores.
- MCP adapter is dependency-free and does not use the official SDK yet.
- Desktop UI uses hand-authored components instead of shadcn scaffolding.
- Source includes deterministic privacy, authority, storage, async,
  destructive-intent, routing/graph, accessibility, browser, and release
  controls. Re-run every required gate for the exact candidate; do not reuse a
  historical pass.
- The live AI-provider smoke runner is opt-in and is not part of the default
  automated test command.
- Packaged Windows WebView/sidecar, installer/signing, assistive technology,
  physical devices, and rollback remain qualification obligations until
  artifact-bound evidence exists. See
  [Frontend qualification](qualification/frontend-qualification-matrix.md).
