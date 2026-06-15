# API Reference

AI Memory exposes one behavioral API through the daemon. CLI and MCP adapters call that API.

## Daemon

Default endpoint:

```text
POST http://127.0.0.1:37841/rpc
Authorization: Bearer local-dev-token
Content-Type: application/json
```

Request shape:

```json
{
  "id": 1,
  "method": "memory.get_startup_state",
  "params": {
    "workingDirectory": "D:/work/my-app",
    "clientName": "codex"
  }
}
```

Response shape:

```json
{
  "id": 1,
  "ok": true,
  "result": {}
}
```

Error shape:

```json
{
  "id": 1,
  "ok": false,
  "error": {
    "message": "Project not found: my-app"
  }
}
```

## Daemon Methods

### Health

- `memory.health`

### Projects

- `memory.list_projects`
- `memory.get_project`
- `memory.detect_project`
- `memory.get_startup_state`
- `memory.prepare_project_creation`
- `memory.create_project`
- `memory.get_project_summary`
- `memory.ensure_project`
- `memory.validate_project`
- `memory.rebuild_index`
- `memory.export_project_manifest`

### Sessions

- `memory.start_session`
- `memory.start_or_resume_session`
- `memory.get_active_session`
- `memory.get_latest_session`
- `memory.get_recent_sessions`
- `memory.list_project_sessions`
- `memory.save_checkpoint`
- `memory.close_session`

### Context

- `memory.preview_context_bundle`
- `memory.get_context_bundle`

Preview does not persist bundle/audit files. Get persists the bundle and audit metadata.

### Docs

- `memory.list_docs`
- `memory.create_doc`
- `memory.import_doc`

`memory.import_doc` currently routes to document creation in the daemon dispatch.

### Search And Graph

- `memory.search`
- `memory.get_graph`

Search is project-scoped by default.

### Memory Inbox

- `memory.propose_memory_update`
- `memory.list_inbox`
- `memory.update_inbox_status`

### Backup

- `memory.backup_project`

Creates a local directory snapshot under `backups/snapshots`.

### Assistant

- `memory.assistant_status`
- `memory.summarize_session`
- `memory.prepare_return_summary`
- `memory.classify_imported_doc`

Assistant methods create reviewable Memory Inbox proposals. They do not directly update canonical memory.

## CLI Commands

```text
aimem projects
aimem detect [path]
aimem status --project <id>
aimem init [path] --name <name> --bootstrap AGENTS.md,CLAUDE.md
aimem start "task title" --project <id> --agent codex
aimem resume --project <id>
aimem sessions --project <id>
aimem context --project <id> --preview
aimem checkpoint --project <id> --session <id> "summary"
aimem close --project <id> --session <id> "summary"
aimem search --project <id> "query"
aimem inbox --project <id>
aimem graph --project <id>
aimem backup --project <id>
aimem validate --project <id>
aimem rebuild-index --project <id>
aimem import <file> --project <id>
aimem assistant status --project <id>
aimem assistant summarize-session --project <id> --session <id>
aimem assistant return-summary --project <id>
aimem assistant classify-doc --project <id> --doc <id>
```

## MCP Tools

The MCP adapter exposes the same behavior with `memory.*` tool names.

Core tools:

- `memory.get_startup_state`
- `memory.list_projects`
- `memory.detect_project`
- `memory.prepare_project_creation`
- `memory.create_project`
- `memory.get_project_summary`
- `memory.get_active_session`
- `memory.get_latest_session`
- `memory.get_recent_sessions`
- `memory.list_project_sessions`
- `memory.start_session`
- `memory.start_or_resume_session`
- `memory.preview_context_bundle`
- `memory.get_context_bundle`
- `memory.save_checkpoint`
- `memory.close_session`
- `memory.search`
- `memory.create_doc`
- `memory.propose_memory_update`
- `memory.list_inbox`
- `memory.get_graph`
- `memory.backup_project`
- `memory.validate_project`
- `memory.rebuild_index`
- `memory.assistant_status`
- `memory.summarize_session`
- `memory.prepare_return_summary`
- `memory.classify_imported_doc`

## MCP Prompt Resources

- `memory://prompts/start-project-work`
- `memory://prompts/save-progress`
- `memory://prompts/close-session`
- `memory://prompts/use-project-scoped-sessions`

## Security Notes

- The daemon binds to localhost by default.
- RPC requests require a bearer token.
- The default token is a development placeholder.
- A packaged product should generate and store a per-user local token.
- Remote access should remain disabled unless explicitly configured.
