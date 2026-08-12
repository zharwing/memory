# Setup

This guide starts Zharwing Memory from a source checkout without mixing the
application repository, private memory, or public documentation.

## Requirements

- Node.js 22.21.x or 24.x
- pnpm 9 through Corepack
- Git
- a private memory directory outside the source checkout
- Rust and the platform prerequisites for Tauri only when using the native app

The repository declares the exact supported Node and pnpm ranges. Do not put a
private memory store under `website/`, `docs/`, a build-output folder, or any
directory intended for publication.

## Install The Source Dependencies

From the repository root:

```text
corepack pnpm install
```

Choose an absolute private memory path owned by the current OS user. Configure
`ZHARWING_MEMORY_ROOT` through the local runtime environment. Local
configuration and credentials are machine state: do not commit them, paste
them into documentation, or expose them to a browser bundle.

## Choose A Runtime Profile

Memory has two explicit local profiles.

| Profile | Intended use | Authority boundary |
| --- | --- | --- |
| `personal-preview` | Current single-user compatibility preview | Loopback only; token authentication is the normal mode and an explicitly selected no-auth mode is limited to loopback |
| `hardened-local` | The fail-closed local authority model | Exact loopback host, authenticated browser or desktop session, and distinct project-bound agent authority |

`personal-preview` remains the compatibility default during the migration. It
must not be described as a multi-user or internet-facing deployment.
`hardened-local` refuses no-auth operation and refuses a non-loopback bind.

Never reuse an administrator credential as an agent credential. A hardened
agent connection requires a distinct credential and an exact project binding
at the trusted host boundary. Browser and native credentials are also separate.
See [Principal Model](security/principal-model.md) and
[Browser Session Security](security/browser-session.md).

## Start The Browser Interface

The browser uses a cookie/CSRF session and never a shared bearer. For the
current loopback-only compatibility preview, set these local values before
starting the two processes:

```text
ZHARWING_MEMORY_PROFILE=personal-preview
ZHARWING_MEMORY_AUTH_MODE=none
ZHARWING_PUBLIC_PROFILE=personal-preview
ZHARWING_PUBLIC_DAEMON_URL=http://127.0.0.1:37841
```

`ZHARWING_PUBLIC_*` values are public browser-build configuration, not secrets.
This exact preview is refused outside loopback and is unavailable under
`hardened-local`.

Use two terminals in the repository root.

Terminal 1:

```text
corepack pnpm dev:daemon
```

Terminal 2:

```text
corepack pnpm dev:web
```

Open `http://localhost:5174/`. The Vite process does not start the daemon. The
browser interface and daemon must both remain local. The public documentation
website at `/memory/` is a separate static artifact and cannot access the
private daemon or memory directory.

Token-authenticated and hardened browser use requires a trusted launcher to
issue a one-shot code into the URL fragment. The app removes the fragment and
exchanges it for a short-lived HttpOnly cookie plus an in-memory CSRF value.
There is no browser bearer fallback. See [Browser UI](WEB_UI.md).

## Start The Native Interface

```text
corepack pnpm dev:desktop
```

The Tauri host starts and owns an exact-loopback hardened daemon and native
folder selection. It refuses to attach to an already-running unrelated daemon.
The native host owns the one-shot desktop authority exchange; the webview
receives typed operation results, not raw credentials. A packaged build needs
its daemon sidecar or an explicit trusted daemon command.

## Connect An Agent

Enable only the focused eleven-operation daily-memory surface. The supported
setup and diagnostic commands are documented in [MCP Setup](MCP_SETUP.md).

Consequential agent calls use the original JSON-RPC request identity as their
stable retry identity. Reuse that identity only when retrying the same logical
call. If an operation reports an unknown outcome, reconcile it; do not invent a
new key and blindly repeat it.

## First Project

1. Open the local browser or desktop interface.
2. Create a Memory project.
3. Link one or more source repositories.
4. Keep the memory directory separate from every linked repository.
5. Start a work session, save a checkpoint, and close the session when done.
6. Preview context before sending it to an agent or provider.

## Public Documentation

The documentation artifact is generated from a fixed public source manifest:

```text
corepack pnpm docs:site
corepack pnpm check:docs-site
```

Generation creates one stable page per guide and a bounded search index. It
does not read a private memory store, local configuration, execution evidence,
or environment files. See [Source And Context Boundary](SOURCE_CONTEXT.md).

## Troubleshooting

- If the browser cannot connect, confirm the daemon is running on the expected
  loopback address.
- If a request is locked or unauthorized, renew the intended browser, desktop,
  or agent authority instead of substituting another audience's credential.
- If a selected project changes, wait for the new project scope to be accepted
  before trusting route content.
- If a mutation outcome is unknown, refresh or reconcile before retrying.
- If the public website does not show local projects, that is correct: it is
  static documentation only.
