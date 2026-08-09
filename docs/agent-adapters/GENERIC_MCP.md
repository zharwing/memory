# Generic MCP Adapter

Use this adapter when an agent has Zharwing Memory MCP tools.

The daily-memory surface is complete and intentionally limited to eleven tools.
Administrative daemon methods are not missing MCP capabilities; they belong to
the UI and CLI administration interfaces.

## Startup

1. Call `memory.get_startup_state` once for the work round with the current
   working directory or project id.
2. Use its compact active/latest/recent summaries to carry forward unfinished
   tasks, current next steps, current blockers, and recent touched files.
3. Do not call `memory.get_latest_session` when startup already supplies enough
   context.
4. Call `memory.start_session` for a new daily/work-round session by default.
5. Call `memory.search` with the task, feature, error, or file names involved.
6. Search before requesting detail. Call `memory.get_session_detail` only for
   explicitly needed body or paginated checkpoint history.
7. Preview or persist a context bundle only when compact state and targeted
   search are insufficient.

## During Work

- Use `memory.save_checkpoint` after meaningful progress.
- Supplied `nextSteps` and `blockers` replace current state; empty arrays clear
  it; omitted fields preserve it.
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
