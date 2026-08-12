# JSON-RPC Adapter

Use this adapter when MCP and the CLI are unavailable but the local Zharwing
Memory daemon is reachable.

## Endpoint

```text
POST <daemon-url>/agent-rpc
Authorization: Bearer <dedicated-project-bound-agent-credential>
Content-Type: application/json
```

The trusted daemon host registers the credential as the `agent` audience with
an exact project binding. Use `ZHARWING_MEMORY_AGENT_CREDENTIAL` for the agent
process and `ZHARWING_MEMORY_AGENT_PROJECT_ID` for daemon-side registration.
Do not substitute the compatibility administrator token, a browser cookie/CSRF
session, or the native desktop credential.

## Request Shape

```json
{
  "id": 1,
  "method": "memory.get_startup_state",
  "params": {
    "workingDirectory": "<repo-root>",
    "clientName": "<agent-name>"
  }
}
```

The JSON-RPC adapter may call only the agent operation set listed in the API
reference. The registrar requires every request to match the credential's exact
project; an agent cannot request cross-project context.

Startup returns compact summaries and a stable revision. A justified refresh
may pass that value as `knownRevision`; unchanged state returns a minimal
`notModified` response. Use `memory.get_session_detail` for explicitly selected
body or paginated checkpoint history.
