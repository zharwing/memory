# Browser UI

Zharwing Memory includes a full local browser interface. It is the same React
control plane used inside the Tauri desktop window, not a reduced demo and not
the public documentation website.

Use it for day-to-day project administration, sessions, workstreams, documents,
diagrams, graph inspection, context preview, imports, search, backups, Trash,
and settings.

## Browser UI, Desktop App, And Documentation Website

These are three different surfaces:

| Surface | Where it runs | What it does |
| --- | --- | --- |
| Local browser UI | `http://localhost:5174/` | Full Memory UI connected to your local daemon and private store |
| Native desktop app | Tauri window | The same React UI with native folder pickers and daemon lifecycle help |
| Public website | `https://zharwing.barbutsa.com/memory/` | Product documentation only; it cannot read or host your memory |

## Start From Source

Requirements:

- Node.js 22.21 or 24
- pnpm 9 through Corepack
- a private memory-store folder outside the cloned repository

Install and create local configuration:

```text
corepack pnpm install
copy .env.example .env
```

On macOS or Linux, use `cp .env.example .env` instead.

Edit `.env` and set at least:

```text
ZHARWING_MEMORY_ROOT=<absolute-private-store-path>
ZHARWING_MEMORY_DAEMON_URL=http://127.0.0.1:37841
ZHARWING_MEMORY_AUTH_TOKEN=<local-random-token>
VITE_ZHARWING_MEMORY_DAEMON_URL=http://127.0.0.1:37841
VITE_ZHARWING_MEMORY_AUTH_TOKEN=<same-local-random-token>
```

The daemon token and Vite token must match. Vite reads its environment when it
starts, so restart `dev:web` after changing browser variables.

Open two terminals in the repository.

Terminal 1 — local daemon:

```text
corepack pnpm dev:daemon
```

Terminal 2 — browser UI:

```text
corepack pnpm dev:web
```

Then open:

```text
http://localhost:5174/
```

`dev:web` does not start the daemon. Keep both terminal processes running while
using the browser UI.

## First Use

1. Open `http://localhost:5174/`.
2. Create a project from Setup.
3. For a multi-repository product, choose **Project only**, then add repository
   roots from Repos.
4. For a single repository, choose **Project plus one repo**.
5. In browser mode, paste or type absolute local paths into path fields.
6. Optionally use Import to preview existing Markdown docs or session history
   before committing the import.

The main navigation includes Dashboard, Repos, Work, Library, Import, Search,
Trash, and Settings. See [Browser And Desktop UI](DESKTOP_UI.md) for the full
navigation and workflow reference.

## Browser Versus Native Desktop

Both modes render the same React application and call the same daemon API.

| Behavior | Browser UI | Native Tauri app |
| --- | --- | --- |
| Human-facing features | Same core pages and workflows | Same core pages and workflows |
| Daemon startup | Start `dev:daemon` separately | Source checkout starts or reuses it automatically |
| Folder selection | Type or paste absolute paths | OS **Browse** buttons are available |
| App location | Browser tab at port `5174` | Native window |
| Best fit | Daily local use, development, and debugging | Native folder selection and desktop workflow |

Browsers cannot reveal arbitrary absolute folder paths to a web application.
That platform restriction is why Browse buttons are unavailable in browser
mode; it does not remove the underlying project, repo, or import features.

## Local Authentication

The recommended source setup uses token authentication. Keep
`ZHARWING_MEMORY_AUTH_TOKEN` and `VITE_ZHARWING_MEMORY_AUTH_TOKEN` identical.
The token is a local credential and should never be committed.

For a strictly localhost-only personal setup, the daemon also supports:

```text
ZHARWING_MEMORY_AUTH_MODE=none
```

No-auth mode is refused on non-loopback hosts. Do not expose the Vite UI or
daemon to a public network.

## Troubleshooting

### The UI says it cannot reach the daemon

- Confirm `corepack pnpm dev:daemon` is still running.
- Confirm the daemon URL is `http://127.0.0.1:37841` in `.env`.
- Restart the browser UI after changing Vite environment variables.

### Requests are unauthorized

- Confirm `ZHARWING_MEMORY_AUTH_TOKEN` and
  `VITE_ZHARWING_MEMORY_AUTH_TOKEN` contain the same value.
- Restart both processes after correcting `.env`.

### `dev:web` exits instead of choosing another port

The Vite server intentionally uses strict port `5174`. Stop the process already
using that port, then start `dev:web` again.

### Browse is disabled

This is expected in a normal browser. Paste or type the absolute path, or use
`corepack pnpm dev:desktop` for the native OS folder picker.

### The public website does not show my projects

This is expected. The public website is documentation only. Your projects are
available only through your local browser UI, desktop app, CLI, and connected
agent tools.

