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
    "workingDirectory": "<repo-root>",
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
- `memory.delete_project`
- `memory.get_project_summary`
- `memory.update_memory_write_policy`
- `memory.update_graph_rules`
- `memory.ensure_project`
- `memory.list_project_repos`
- `memory.link_repo`
- `memory.unlink_repo`
- `memory.delete_repo`
- `memory.list_workstreams`
- `memory.create_workstream`
- `memory.get_workstream_detail`
- `memory.update_workstream_status`
- `memory.delete_workstream`
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
- `memory.delete_session`

### Workstreams

Workstreams group related sessions and documents for multi-day topics or epics.
Repo roles/categories used by workstreams are free-form metadata.

### Context

- `memory.preview_context_bundle`
- `memory.get_context_bundle`

Preview does not persist bundle/audit files. Get persists the bundle and audit metadata.

### Docs

- `memory.list_docs`
- `memory.create_doc`
- `memory.import_doc`
- `memory.update_doc`
- `memory.delete_doc`

`memory.import_doc` currently routes to document creation in the daemon dispatch.
`memory.create_doc` writes directly when project memory write policy allows
direct agent writes. If review mode is set to review every memory update,
callers should use `memory.propose_memory_update` instead.
`memory.update_doc` rewrites the existing Markdown document body/title in place
and preserves its file path and existing metadata.

### Import

- `memory.list_import_profiles`
- `memory.prepare_import`
- `memory.commit_import`

`memory.prepare_import` scans a folder and returns an import plan without writing
files. `memory.commit_import` commits either a reviewed plan or a source
folder/profile pair. Conflict strategy is `skip`, `overwrite`, or `duplicate`.

### Search And Graph

- `memory.search`
- `memory.get_graph`
- `memory.update_graph_rules`

Search is project-scoped by default.
`memory.get_graph` returns the derived project context graph. The graph is
rebuilt from project/session/document metadata and `project.graphRules`; it is
not the source of truth.

`memory.update_graph_rules` replaces the project's deterministic graph
extraction rules. Use it for manual settings saves or explicitly approved
changes. For AI-suggested changes, prefer `memory.propose_graph_update` so the
proposal lands in Memory Inbox first.

Example graph rules payload:

```json
{
  "projectId": "my-app",
  "graphRules": [
    { "match": "apps/*", "nodeType": "package", "topic": "frontend" },
    { "match": "services/*", "nodeType": "service", "topic": "backend" }
  ]
}
```

See [Graph Rules](GRAPH_RULES.md) for match semantics and AI workflow.

### Memory Inbox

- `memory.propose_memory_update`
- `memory.propose_graph_update`
- `memory.list_inbox`
- `memory.update_inbox_status`
- `memory.delete_inbox_item`

The inbox is optional. Default project policy allows routine agent memory writes
directly through session and document APIs. Use inbox proposals when review mode
is enabled or the update is risky, uncertain, or needs human judgment.

`memory.propose_graph_update` creates a `graph-update` proposal for reviewed AI
suggestions. The `proposedPatch` should be a JSON array of graph rules or an
object containing `graphRules`.

### Backup

- `memory.backup_project`
- `memory.list_backups`
- `memory.delete_backup`

Creates, lists, and moves local directory snapshots under `backups/snapshots`.

### Trash

- `memory.list_trash`
- `memory.restore_trash_item`
- `memory.purge_trash_item`
- `memory.empty_trash`

Delete methods move items to Trash first. Restore moves recoverable items back
to their active location. Purge permanently deletes one trash item. Empty Trash
permanently deletes selected trash item ids, or all trash items when no ids are
provided.

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
aimem repos --project <id>
aimem link-repo <path> --project <id> --name "Product Runtime" --role product-runtime
aimem unlink-repo <path> --project <id>
aimem workstreams --project <id>
aimem create-workstream "Huddle" --project <id> --topic huddle,realtime
aimem workstream huddle --project <id>
aimem init [path] --name <name> --bootstrap AGENTS.md,CLAUDE.md
aimem init --name <name> --project-only --no-pointer
aimem start "task title" --project <id> --agent codex --workstream <workstream-id>
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
aimem import-profiles
aimem import-folder <path> --project <id> --profile markdown-memory
aimem import-folder <path> --project <id> --profile markdown-sessions --commit
aimem import-commit <path> --project <id> --profile generic-markdown
aimem agent-instructions --project <id> --agent generic
aimem agent-instructions --project <id> --agent codex --output AGENTS.md
aimem agent-instructions --project <id> --agent claude --output CLAUDE.md
aimem agent-instructions --project <id> --agent qwen --output QWEN.md
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
- `memory.delete_project`
- `memory.get_project_summary`
- `memory.update_memory_write_policy`
- `memory.list_project_repos`
- `memory.link_repo`
- `memory.unlink_repo`
- `memory.delete_repo`
- `memory.list_workstreams`
- `memory.create_workstream`
- `memory.get_workstream_detail`
- `memory.update_workstream_status`
- `memory.delete_workstream`
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
- `memory.delete_session`
- `memory.search`
- `memory.create_doc`
- `memory.update_doc`
- `memory.delete_doc`
- `memory.list_import_profiles`
- `memory.prepare_import`
- `memory.commit_import`
- `memory.propose_memory_update`
- `memory.propose_graph_update`
- `memory.list_inbox`
- `memory.update_inbox_status`
- `memory.delete_inbox_item`
- `memory.get_graph`
- `memory.update_graph_rules`
- `memory.backup_project`
- `memory.list_backups`
- `memory.delete_backup`
- `memory.list_trash`
- `memory.restore_trash_item`
- `memory.purge_trash_item`
- `memory.empty_trash`
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
