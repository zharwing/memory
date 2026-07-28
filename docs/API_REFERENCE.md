# API Reference

Zharwing Memory keeps behavior in the daemon. The CLI exposes broad operator
workflows, while MCP intentionally exposes only the eleven tools needed for an AI
agent's daily memory loop. A daemon method appearing below does not
automatically make it an MCP tool.

## Daemon

Default endpoint:

```text
POST http://127.0.0.1:37841/rpc
Authorization: Bearer <auth-token>
Content-Type: application/json
```

The daemon uses token auth by default. The token comes from
`ZHARWING_MEMORY_AUTH_TOKEN` when set; otherwise the daemon generates a random
per-user token on first start and stores it in the OS user state directory
(`%APPDATA%\zharwing-memory\daemon-token` on Windows, `$XDG_STATE_HOME` or
`~/.local/state/zharwing-memory/daemon-token` on POSIX). Delete the file to
rotate the token. Placeholder tokens copied from example configuration are for
local development only and must never be exposed beyond the local machine or
committed to a repo.

Streamable HTTP MCP endpoint:

```text
POST http://127.0.0.1:37841/mcp
Content-Type: application/json
```

The HTTP `/mcp` endpoint and the stdio MCP adapter stay disabled until
`ZHARWING_MEMORY_AGENT_SURFACE=enabled` is set in the daemon/adapter
environment.

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

This is the full authenticated JSON-RPC control plane used by the UI and CLI.
See [MCP Tools](#mcp-tools) for the smaller agent-facing surface.

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
- `memory.update_assistant_policy`
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
- `memory.get_session_detail`
- `memory.list_project_sessions`
- `memory.save_checkpoint`
- `memory.close_session`
- `memory.generate_session_summary`
- `memory.generate_session_summaries`
- `memory.update_session_graph_visibility`
- `memory.delete_session`

`memory.update_session_graph_visibility` is a UI/control-plane operation with
`projectId`, `sessionId`, and boolean `includeInGraph` parameters. New and
legacy sessions default to `false`. This method is intentionally not part of
the MCP tool list, so an agent cannot opt its own routine sessions into the
graph.

`memory.get_startup_state`, `memory.get_latest_session`,
`memory.get_recent_sessions`, and `memory.list_project_sessions` return compact
session summaries. Summaries never contain the Markdown `body` or the
`checkpoints` array. Startup returns at most three non-duplicated recent
summaries and does not duplicate the active session as `latestSession`; when
the active session is latest, `activeSession` is authoritative. Startup also
returns a `revision`; pass that revision as `knownRevision` only for a justified
refresh. An unchanged refresh returns only:

```json
{
  "schema": "zharwing.memory.startup.v2",
  "notModified": true,
  "projectId": "<project-id>",
  "sessionId": "<active-or-latest-session-id>",
  "revision": "<revision>"
}
```

Use `memory.get_session_detail` with `projectId`, `sessionId`, and explicitly
requested `sections` (`body`, `checkpoints`) for progressive detail.
`checkpointLimit` defaults to 20 and is capped at 100. Checkpoints are returned
newest first; pass the opaque `nextCursor` to continue.

For checkpoint and closeout state, omitted `nextSteps` or `blockers` preserve
current state, an explicit empty array clears it, and a supplied non-empty array
replaces it. Touched files remain checkpoint-local in history while the session
keeps aggregate file metadata for search and graph consumers.

### Workstreams

Workstreams group related sessions and documents for multi-day topics or epics.
Repo roles/categories used by workstreams are free-form metadata.

Workstream creation and administration stay in the UI/CLI control plane, but
agents can still attach sessions to existing lanes:
`memory.get_startup_state` returns the project's open (active or paused)
workstreams, and `memory.start_session`, `memory.save_checkpoint`, and
`memory.close_session` all accept a `workstreamIds` array. Checkpoint and close
merge the ids into the session, so a session can be attached mid-work when the
topic becomes clear, not only at start.

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
direct agent writes. If review mode is set to review every memory update, UI,
CLI, or authenticated daemon clients should use
`memory.propose_memory_update` instead.
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
rebuilt from project/document metadata, explicitly opted-in session metadata,
and `project.graphRules`; it is not the source of truth.

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
zharwing-memory checkpoint --project <id> --session <id> "summary" --workstream <workstream-id>
zharwing-memory close --project <id> --session <id> "summary" --workstream <workstream-id>
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

The MCP adapter intentionally exposes only the daily AI-memory workflow over
the daemon HTTP endpoint or stdio adapter. Daemon administration, project
creation, deletion, imports, backups, graph settings, and Trash remain UI/CLI
control-plane operations.

Supported MCP tools:

- `memory.health`
- `memory.get_startup_state`
- `memory.get_latest_session`
- `memory.get_recent_sessions`
- `memory.get_session_detail`
- `memory.start_session`
- `memory.search`
- `memory.preview_context_bundle`
- `memory.get_context_bundle`
- `memory.save_checkpoint`
- `memory.close_session`

`memory.get_startup_state` includes bounded compact summaries and the open
workstreams so an agent can attach its session to an existing lane;
`memory.start_session`,
`memory.save_checkpoint`, and `memory.close_session` accept `workstreamIds`.
Workstream creation remains a control-plane operation.

Memory in the selected project is AI-visible by default. Normal session data,
file paths, and search metadata are returned to the coding agent. Explicit
visibility exclusions, never-send patterns, and secret detection remain in the
search/context pipeline.

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
- There is no built-in default token. When `ZHARWING_MEMORY_AUTH_TOKEN` is
  unset, the daemon generates a random per-user token and stores it with
  restrictive permissions in the OS user state directory.
- Placeholder tokens from example files are for local development only; never
  reuse them on a reachable interface or commit a real token to a repo.
- Agent-facing surfaces (HTTP `/mcp` and stdio MCP) additionally require
  `ZHARWING_MEMORY_AGENT_SURFACE=enabled`.
- Remote access should remain disabled unless explicitly configured.
