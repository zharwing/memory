# Generic MCP Adapter

Use this adapter when an agent has Zharwing Memory MCP tools.

The daily-memory surface is complete and intentionally limited to ten tools.
Administrative daemon methods are not missing MCP capabilities; they belong to
the UI and CLI control plane.

## Startup

1. Call `memory.get_startup_state` with the current working directory or project
   id.
2. Read the latest relevant previous session with `memory.get_latest_session`,
   or `memory.get_recent_sessions`.
3. Carry forward unfinished tasks, next steps, blockers, touched files, and
   important decisions.
4. Call `memory.start_session` for a new daily/work-round session by default.
5. Call `memory.search` with the task, feature, error, or file names involved.
6. Call `memory.preview_context_bundle` before placing prior context into a
   prompt.
7. Call `memory.get_context_bundle` when the bundle is actually used.

## During Work

- Use `memory.save_checkpoint` after meaningful progress.
- Treat sessions, file paths, and routine metadata in the selected project as
  normal AI-visible memory.
- Use the UI or CLI for project administration, imports, graph settings,
  backups, Trash, or durable document editing.

## Closeout

Call `memory.close_session` with:

- concrete summary
- next steps
- blockers, if any
- touched files, if known

The MCP surface is intentionally limited to the daily coding-memory loop.
