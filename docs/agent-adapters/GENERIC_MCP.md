# Generic MCP Adapter

Use this adapter when an agent has AI Memory MCP tools.

## Startup

1. Call `memory.get_startup_state` with the current working directory or project
   id.
2. Call `memory.search` with the task, feature, error, or file names involved.
3. Call `memory.start_or_resume_session` or `memory.start_session` for
   meaningful work.
4. Call `memory.preview_context_bundle` before placing prior context into a
   prompt.
5. Call `memory.get_context_bundle` when the bundle is actually used.

## During Work

- Use `memory.save_checkpoint` after meaningful progress.
- Use `memory.list_workstreams` and `memory.get_workstream_detail` when the task
  belongs to a multi-day topic.
- Use `memory.create_doc` for routine durable memory when review mode is off.
- Use `memory.propose_memory_update` when review mode is enabled or the update is
  risky, uncertain, or needs human judgment.
- Use `memory.propose_graph_update` when imported memory needs better graph
  organization. Use `memory.update_graph_rules` only after explicit user
  approval.

## Closeout

Call `memory.close_session` with:

- concrete summary
- next steps
- blockers, if any
- touched files, if known

Write canonical memory directly by default. Do not write canonical memory
directly when review mode is the project policy path.
