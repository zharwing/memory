# MCP Templates

These are minimal localhost HTTP MCP examples for manual setup.

For normal setup, prefer:

```text
zharwing-memory mcp install auto
zharwing-memory mcp doctor
```

The templates omit bearer-token configuration because they are easiest to read
as `ZHARWING_MEMORY_AUTH_MODE=none` loopback examples. For token-auth daemon setups, keep
the token in `ZHARWING_MEMORY_AUTH_TOKEN` and let the installer generate the client-specific
environment-variable reference.

Enable `ZHARWING_MEMORY_AGENT_SURFACE=enabled` in the daemon/MCP environment.
The server then advertises the complete ten-tool daily-memory surface: health,
startup state, latest/recent sessions, session creation, search, context
preview/load, checkpoints, and closeout. Project administration remains in the
UI and CLI by design.

See `../../docs/MCP_SETUP.md` for HTTP, stdio, auth, Windows/WSL, and
troubleshooting details.
