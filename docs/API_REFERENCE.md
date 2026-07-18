# API Reference

Zharwing Memory exposes one behavioral API through the daemon. CLI and MCP adapters call that API.

## Daemon

Default endpoint:

```text
POST http://127.0.0.1:37841/rpc
Authorization: Bearer local-dev-token
Content-Type: application/json
```

Streamable HTTP MCP endpoint:

```text
POST http://127.0.0.1:37841/mcp
Content-Type: application/json
```

For localhost-only personal use, set `ZHARWING_MEMORY_AUTH_MODE=none` to allow MCP
clients to connect without a bearer token. The daemon refuses no-auth mode when
bound to a non-loopback host.

The stdio MCP entrypoint is:

```text
zharwing-memory mcp serve
```

Client config can be generated with `zharwing-memory mcp install auto` or
`zharwing-memory mcp install <client>`. See
[MCP Setup](MCP_SETUP.md) for supported clients, auth modes, and transport
choices.

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
- `memory.mcp_doctor`
- `memory.mcp_install`

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
- `memory.generate_session_summary`
- `memory.generate_session_summaries`
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

### Semantic Graph

- `memory.get_semantic_graph_settings`
- `memory.update_semantic_graph_settings`
- `memory.get_semantic_graph_status`
- `memory.list_semantic_edges`
- `memory.update_semantic_edge_status`
- `memory.list_semantic_graph_runs`
- `memory.get_semantic_graph_run`
- `memory.preview_semantic_graph_analysis`
- `memory.analyze_semantic_graph`
- `memory.check_semantic_graph_provider`
- `memory.propose_semantic_edges`
- `memory.accept_semantic_edges_proposal`

Semantic graph methods are optional. They add LLM-assisted relationship
analysis on top of the deterministic graph. `preview` builds the scoped
document/candidate plan without calling a model. `analyze` supports `dry-run`,
`review`, and `auto` modes. Review mode writes Memory Inbox proposals; accepted
edges are stored under `semantic-graph/edges.json` and can be overlaid with
`memory.get_graph` by passing semantic include options.

See [Semantic Graph Analysis](SEMANTIC_GRAPH.md) for the recommended local
provider and review workflow.

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
- `memory.generate_session_summary`
- `memory.generate_session_summaries`
- `memory.prepare_return_summary`
- `memory.classify_imported_doc`

Legacy assistant proposal methods create reviewable Memory Inbox proposals.
Session TLDR generation methods write searchable session summary metadata
directly unless a future project policy routes that metadata through review.

## CLI Commands

```text
zharwing-memory projects
zharwing-memory detect [path]
zharwing-memory status --project <id>
zharwing-memory repos --project <id>
zharwing-memory link-repo <path> --project <id> --name "Product Runtime" --role product-runtime
zharwing-memory unlink-repo <path> --project <id>
zharwing-memory workstreams --project <id>
zharwing-memory create-workstream "Huddle" --project <id> --topic huddle,realtime
zharwing-memory workstream huddle --project <id>
zharwing-memory init [path] --name <name> --bootstrap AGENTS.md,CLAUDE.md
zharwing-memory init --name <name> --project-only --no-pointer
zharwing-memory start "task title" --project <id> --agent codex --workstream <workstream-id>
zharwing-memory resume --project <id>
zharwing-memory sessions --project <id>
zharwing-memory context --project <id> --preview
zharwing-memory checkpoint --project <id> --session <id> "summary"
zharwing-memory close --project <id> --session <id> "summary"
zharwing-memory assistant generate-session-summary --project <id> --session <id>
zharwing-memory assistant generate-session-summaries --project <id>
zharwing-memory assistant generate-session-summaries --project <id> --all
zharwing-memory search --project <id> "query"
zharwing-memory inbox --project <id>
zharwing-memory graph --project <id>
zharwing-memory backup --project <id>
zharwing-memory validate --project <id>
zharwing-memory rebuild-index --project <id>
zharwing-memory import <file> --project <id>
zharwing-memory import-profiles
zharwing-memory import-folder <path> --project <id> --profile markdown-memory
zharwing-memory import-folder <path> --project <id> --profile markdown-sessions --commit
zharwing-memory import-commit <path> --project <id> --profile generic-markdown
zharwing-memory agent-instructions --project <id> --agent generic
zharwing-memory agent-instructions --project <id> --agent codex --output AGENTS.md
zharwing-memory agent-instructions --project <id> --agent claude --output CLAUDE.md
zharwing-memory agent-instructions --project <id> --agent qwen --output QWEN.md
zharwing-memory assistant status --project <id>
zharwing-memory assistant summarize-session --project <id> --session <id>
zharwing-memory assistant generate-session-summary --project <id> --session <id>
zharwing-memory assistant generate-session-summaries --project <id>
zharwing-memory assistant return-summary --project <id>
zharwing-memory assistant classify-doc --project <id> --doc <id>
zharwing-memory semantic-graph status --project <id>
zharwing-memory semantic-graph analyze --project <id> --mode dry-run --max-docs 8
zharwing-memory semantic-graph analyze --project <id> --mode review --node <graph-node-id>
zharwing-memory semantic-graph analyze --project <id> --mode dry-run --no-json-mode
zharwing-memory semantic-graph runs --project <id>
zharwing-memory semantic-graph edges --project <id> --status accepted,auto-accepted
```

## MCP Tools

The MCP adapter exposes the same behavior with `memory.*` tool names over the
daemon HTTP endpoint or the stdio adapter.

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
- `memory.generate_session_summary`
- `memory.generate_session_summaries`
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
- `memory.get_semantic_graph_settings`
- `memory.update_semantic_graph_settings`
- `memory.get_semantic_graph_status`
- `memory.list_semantic_edges`
- `memory.update_semantic_edge_status`
- `memory.list_semantic_graph_runs`
- `memory.get_semantic_graph_run`
- `memory.preview_semantic_graph_analysis`
- `memory.analyze_semantic_graph`
- `memory.check_semantic_graph_provider`
- `memory.propose_semantic_edges`
- `memory.accept_semantic_edges_proposal`
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
- `memory.generate_session_summary`
- `memory.generate_session_summaries`
- `memory.prepare_return_summary`
- `memory.classify_imported_doc`

## MCP Prompt Resources

- `memory://prompts/start-project-work`
- `memory://prompts/save-progress`
- `memory://prompts/close-session`
- `memory://prompts/use-project-scoped-sessions`

## Security Notes

- The daemon binds to localhost by default.
- RPC requests require a bearer token unless `ZHARWING_MEMORY_AUTH_MODE=none` is used on
  a loopback-only daemon.
- HTTP MCP requests follow the same daemon auth mode.
- The default token is a development placeholder.
- A packaged product should generate and store a per-user local token.
- Remote access should remain disabled unless explicitly configured.
