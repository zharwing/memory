# MCP Setup

Zharwing Memory exposes `memory.*` tools to external agents through two MCP transports:

1. HTTP MCP on the daemon:

   ```text
   POST http://127.0.0.1:37841/mcp
   ```

2. Stdio MCP from the CLI:

   ```text
   zharwing-memory mcp serve
   ```

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

Tokens are not required by MCP itself. Zharwing Memory uses token auth by default
because the daemon exposes write-capable local methods such as session creation,
document updates, graph rules, and delete operations.

Default mode:

```text
ZHARWING_MEMORY_AUTH_MODE=token
ZHARWING_MEMORY_AUTH_TOKEN=<local-random-token>
```

Local personal mode:

```text
ZHARWING_MEMORY_AUTH_MODE=none
```

No-auth mode is accepted only when the daemon binds to a loopback host such as
`127.0.0.1`, `localhost`, or `::1`. The daemon refuses to start with
`ZHARWING_MEMORY_AUTH_MODE=none` on non-loopback hosts.

For token mode, make the AI client process inherit `ZHARWING_MEMORY_AUTH_TOKEN` or use the
installer's generated environment-variable reference. Do not write real tokens
into repo files.

## Manual Codex Config

No-auth localhost HTTP config:

```toml
[mcp_servers.aimem]
url = "http://127.0.0.1:37841/mcp"
```

Token-auth localhost HTTP config:

```toml
[mcp_servers.aimem]
url = "http://127.0.0.1:37841/mcp"
bearer_token_env_var = "ZHARWING_MEMORY_AUTH_TOKEN"
```

Equivalent Codex CLI commands, when supported by the installed Codex version:

```text
codex mcp add zharwing-memory --url http://127.0.0.1:37841/mcp
codex mcp add zharwing-memory --url http://127.0.0.1:37841/mcp --bearer-token-env-var ZHARWING_MEMORY_AUTH_TOKEN
```

After changing MCP config, restart the AI client.

## Manual Claude Config

No-auth localhost HTTP config:

```json
{
  "mcpServers": {
    "aimem": {
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
    "aimem": {
      "type": "http",
      "url": "http://127.0.0.1:37841/mcp",
      "headers": {
        "Authorization": "Bearer ${ZHARWING_MEMORY_AUTH_TOKEN}"
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
  stdio bridge from Windows.
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
- Auth failure: use `ZHARWING_MEMORY_AUTH_MODE=none` for loopback-only local personal use,
  or make the client inherit `ZHARWING_MEMORY_AUTH_TOKEN`.
- Windows/WSL native dependency errors: reinstall dependencies in the OS where
  the command is being run.
