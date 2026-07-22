# JSON-RPC Adapter

Use this adapter when MCP and the CLI are unavailable but the local Zharwing
Memory daemon is reachable.

## Endpoint

```text
POST <daemon-url>/rpc
Authorization: Bearer <token>
Content-Type: application/json
```

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

The JSON-RPC adapter should call the same `memory.*` methods listed in the API
reference. Keep requests project-scoped unless the user explicitly asks for
cross-project context and policy allows it.
