# Operations

## Runtime Assumptions

Dependencies have been installed in the current checkout. The desktop TypeScript
typecheck and Vite production build have passed. The daemon and browser UI Vite dev
server have been launched successfully.

Native Tauri/Rust validation depends on a local Rust toolchain. Windows
`cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` has passed from
this checkout. A packaged desktop build has not been run.

## Environment Variables

Copy `.env.example` to `.env` and choose a private local memory root:

```text
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
pnpm dev:daemon
```

CLI:

```text
pnpm dev:cli projects
```

Browser UI:

```text
pnpm dev:web
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

Use `pnpm dev:web` for the browser app after `pnpm dev:daemon`. Use
`pnpm dev:desktop` for the native Tauri window. The Tauri dev command starts or
reuses the Vite app on port `5174`, and the desktop shell starts or reuses the
daemon on `127.0.0.1:37841`.

Native Tauri dev window:

```text
pnpm dev:desktop
```

MCP:

```text
pnpm dev:mcp
```

The daemon and browser UI Vite commands have been run during validation. The native
Tauri command requires the local Rust/Tauri toolchain.

## Security

Production packaging should:

- generate a per-user local auth token
- store the token in the OS app data directory or keychain-compatible location
- bind daemon to localhost by default
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
- deterministic session summary proposal
- deterministic return summary proposal
- deterministic document classification proposal

Not implemented yet:

- downloading llama.cpp
- downloading GGUF models
- starting llama-server
- GPU acceleration
- prompt logs
- external local endpoint adapters

## Validation Checklist For Future Runtime Work

1. Install dependencies.
2. Run workspace typecheck.
3. Run unit tests.
4. Build packages.
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

## Known Constraints

- JSON index is a placeholder for SQLite/FTS5.
- MCP adapter is dependency-free and does not use the official SDK yet.
- Desktop UI uses hand-authored components instead of shadcn scaffolding.
- Runtime validation currently covers the daemon health endpoint, React/Vite server, desktop typecheck, and desktop Vite build.
- Full workspace tests have not been run yet.
- Native Tauri `cargo check` has passed through the Windows toolchain, but full Tauri dev smoke testing and packaging have not been completed.
- A packaged Windows desktop build has not been produced yet.
