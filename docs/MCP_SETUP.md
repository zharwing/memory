# MCP Setup

Zharwing Memory exposes `memory.*` tools to external agents through two MCP transports:

1. HTTP MCP on the daemon: `POST http://127.0.0.1:37841/mcp`.
2. Stdio MCP from the CLI: `zharwing-memory mcp serve`.

Use HTTP when the AI client and daemon run in the same OS or network namespace.
Use stdio when a client needs to launch a child process, when HTTP MCP is not
supported, or when a bridge is easier than exposing a daemon URL.

## Install

Start or make sure the daemon is available, then run:

```text
zharwing-memory mcp install auto
zharwing-memory mcp doctor
```

`auto` installs the supported MCP configs for the environment where it is run:

- Codex user config.
- Claude Code `.mcp.json` in the current working directory.
- Claude Desktop user config.
- Windows Codex and Claude Desktop configs as an extra scope when running inside
  WSL and Windows interop exposes the real Windows profile paths.

The installer updates client MCP config and creates a timestamped backup when
replacing an existing file. Stdio configs use the running CLI entrypoint instead
of a hardcoded checkout path.

Generated token-auth configuration uses the dedicated
`ZHARWING_MEMORY_AGENT_CREDENTIAL` and canonical
`ZHARWING_MEMORY_DAEMON_URL` names. It never places the compatibility
administrator token or a browser value in agent configuration. Existing
legacy configuration should be regenerated instead of extending credential
reuse.

Specific client installs remain available:

```text
zharwing-memory mcp install codex
zharwing-memory mcp install claude-code
zharwing-memory mcp install claude-desktop
```

Supported install flags:

```text
--transport <http|stdio>
--daemon-url <url>
--auth <auto|none|token>
--config <path>
--name <server-name>
--dry-run
```

Default config targets:

| Client | Default config |
| --- | --- |
| Codex | `$CODEX_HOME/config.toml` or `~/.codex/config.toml` |
| Claude Code | `.mcp.json` in the current working directory |
| Claude Desktop | The platform Claude desktop config path |

Use `--config <path>` when a client stores config somewhere else.

## Auth Modes

Tokens are not required by MCP itself. Zharwing Memory requires explicit agent
authority because the MCP surface can create sessions and write
checkpoints/closeouts. Agent authority is separate from browser, desktop, and
administrator authority.

Hardened agent mode:

```text
ZHARWING_MEMORY_AUTH_MODE=token
ZHARWING_MEMORY_PROFILE=hardened-local
ZHARWING_MEMORY_AGENT_SURFACE=enabled
ZHARWING_MEMORY_AGENT_CREDENTIAL=<dedicated-opaque-agent-credential>
ZHARWING_MEMORY_AGENT_PROJECT_ID=<exact-project-id>
```

Local personal mode:

```text
ZHARWING_MEMORY_AUTH_MODE=none
```

No-auth mode is a `personal-preview` compatibility option accepted only when
the daemon binds to a loopback host such as `127.0.0.1`, `localhost`, or `::1`.
The daemon refuses it on non-loopback hosts and under `hardened-local`.

For hardened token mode, make the AI client process inherit only
`ZHARWING_MEMORY_AGENT_CREDENTIAL`, or use the installer's generated
environment-variable reference. The daemon receives the same credential and
the exact `ZHARWING_MEMORY_AGENT_PROJECT_ID` at its trusted host boundary. Do
not substitute `ZHARWING_MEMORY_AUTH_TOKEN`; it is the compatibility
administrator credential. Do not write any real credential into repo files.

## Agent Surface

Enable the authenticated daily-memory surface in the daemon and stdio adapter:

```text
ZHARWING_MEMORY_AGENT_SURFACE=enabled
```

The MCP server exposes exactly eleven tools: health, compact startup state,
latest/recent summaries, explicit session detail, session start, project
search, context preview/load, checkpoint, and closeout. Administrative and
destructive daemon methods are not advertised.

Current status: all daily-memory capabilities are implemented.

| What Codex needs | Tool |
| --- | --- |
| Determine the opened project and prior state | `memory.get_startup_state` |
| Read compact prior-work summaries | `memory.get_startup_state`, `memory.get_latest_session`, `memory.get_recent_sessions` |
| Read selected body/checkpoint history | `memory.get_session_detail` |
| Create a memory record for this work round | `memory.start_session` |
| Find earlier decisions, fixes, commands, and notes | `memory.search` |
| Preview or load relevant context | `memory.preview_context_bundle`, `memory.get_context_bundle` |
| Save progress while working | `memory.save_checkpoint` |
| Record completion, blockers, and next steps | `memory.close_session` |

Project creation, repo linking, imports, graph settings, backups, Trash, and
other administration are intentionally UI/CLI operations. Their absence from
`tools/list` is expected and does not mean the Codex memory workflow is
incomplete.

Zharwing Memory is AI-visible by default inside the selected project. Sessions,
file paths, and routine memory metadata are available to Codex without a
per-request approval prompt. Explicit exclusions and secret scanning still
apply to search and generated context.

For a multi-repo project, write `.zharwing/memory.json` in every linked repo by
leaving **Write pointer file** enabled when linking it. Codex can then open any
one of those repos and resolve the same shared memory project. The memory scope
can span all linked repos, but the Codex workspace and filesystem permissions
still belong to the folder opened in that Codex window. See
[Repository Links](REPOSITORIES.md#using-one-memory-project-from-several-codex-workspaces).

## Manual Codex Config

No-auth localhost HTTP config:

```toml
[mcp_servers.zharwing-memory]
url = "http://127.0.0.1:37841/mcp"
```

Token-auth localhost HTTP config:

```toml
[mcp_servers.zharwing-memory]
url = "http://127.0.0.1:37841/mcp"
bearer_token_env_var = "ZHARWING_MEMORY_AGENT_CREDENTIAL"
```

Equivalent Codex CLI commands, when supported by the installed Codex version:

```text
codex mcp add zharwing-memory --url http://127.0.0.1:37841/mcp
codex mcp add zharwing-memory --url http://127.0.0.1:37841/mcp --bearer-token-env-var ZHARWING_MEMORY_AGENT_CREDENTIAL
```

After changing MCP config, restart the AI client.

## Manual Claude Config

No-auth localhost HTTP config:

```json
{
  "mcpServers": {
    "zharwing-memory": {
      "type": "http",
      "url": "http://127.0.0.1:37841/mcp"
    }
  }
}
```

Token-auth localhost HTTP config:

```json
{
  "mcpServers": {
    "zharwing-memory": {
      "type": "http",
      "url": "http://127.0.0.1:37841/mcp",
      "headers": {
        "Authorization": "Bearer ${ZHARWING_MEMORY_AGENT_CREDENTIAL}"
      }
    }
  }
}
```

## Windows And WSL

The MCP URL must be reachable from the process that launches the AI client.
`127.0.0.1` is not a portable machine-wide address; it means "this OS/network
namespace."

Common layouts:

- Windows AI client + Windows daemon: use HTTP MCP at
  `http://127.0.0.1:37841/mcp`.
- WSL AI client + WSL daemon: use HTTP MCP at
  `http://127.0.0.1:37841/mcp`.
- WSL installer + Windows clients: `zharwing-memory mcp install auto` also tries to write
  Windows Codex and Claude Desktop config files by asking Windows for profile
  paths through interop.
- WSL AI client + Windows daemon: first run `zharwing-memory mcp doctor` from WSL. If the
  daemon is not reachable at `127.0.0.1`, run the daemon in WSL or launch a
  stdio bridge from Windows. Startup accepts WSL `/mnt/<drive>/...` working
  directories and normalizes them before Windows pointer/repository detection.
- Windows installer + WSL clients: run `zharwing-memory mcp install auto` inside WSL
  separately. A Windows process should not guess a WSL distro, user, or tool
  path.

Do not bind the daemon to `0.0.0.0` with `ZHARWING_MEMORY_AUTH_MODE=none`. No-auth mode is
intended only for same-machine loopback use.

## Desktop Setup

The desktop UI exposes the same installer from the Setup screen:

- Install Auto
- Install Codex
- Install Claude Code
- Install Claude Desktop
- Check MCP

`Install Auto` installs the configs for the OS where the desktop daemon is
running. For WSL-hosted AI clients, run the CLI installer inside WSL.

After installing from the desktop UI, restart the target AI client.

## Troubleshooting

Run:

```text
zharwing-memory mcp doctor
```

Typical results:

- Daemon unreachable: start the daemon, fix `--daemon-url`, run the daemon in
  the same OS/network namespace, or use a stdio bridge that can reach it.
- `Tools: (none)` in an AI client: the client started but MCP initialization or
  `tools/list` failed. Check the client config and run the doctor command from
  the same shell or OS environment.
- Auth failure: use `ZHARWING_MEMORY_AUTH_MODE=none` only for an explicit
  loopback personal preview, or confirm that the client inherits the dedicated
  `ZHARWING_MEMORY_AGENT_CREDENTIAL` registered for its exact project.
- Windows/WSL native dependency errors: reinstall dependencies in the OS where
  the command is being run.
