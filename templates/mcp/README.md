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

See `../../docs/MCP_SETUP.md` for HTTP, stdio, auth, Windows/WSL, and
troubleshooting details.
