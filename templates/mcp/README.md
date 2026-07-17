# MCP Templates

These are minimal localhost HTTP MCP examples for manual setup.

For normal setup, prefer:

```text
aimem mcp install auto
aimem mcp doctor
```

The templates omit bearer-token configuration because they are easiest to read
as `AIMEM_AUTH_MODE=none` loopback examples. For token-auth daemon setups, keep
the token in `AIMEM_AUTH_TOKEN` and let the installer generate the client-specific
environment-variable reference.

See `../../docs/MCP_SETUP.md` for HTTP, stdio, auth, Windows/WSL, and
troubleshooting details.
