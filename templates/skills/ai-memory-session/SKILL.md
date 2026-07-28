---
name: ai-memory-session
description: Use Zharwing Memory as a project-neutral session memory layer for agentic coding work. Trigger when a repo has Zharwing Memory MCP tools, an `.zharwing/memory.json` pointer, an `zharwing-memory` CLI, or the user asks to resume context, keep daily session history, read yesterday's work, save checkpoints, close out work, or make future AI sessions remember project progress.
---

# Zharwing Memory Session

## Overview

Use Zharwing Memory to resolve the current project, read the latest relevant session,
start a fresh project-scoped work session for the current day or work round, and
leave durable progress updates for future agents. Never hardcode a project id;
resolve it from the working directory, pointer file, user selection, or tool
response.

Memory in the selected project is AI-visible by default, including sessions,
file paths, and routine metadata. Respect explicit visibility exclusions and
never-send rules; do not add a per-request approval ceremony to normal memory.

## Startup

Prefer MCP tools when available. If MCP is unavailable, use the `zharwing-memory` CLI. If
both are unavailable, continue with local files and mention that Zharwing Memory was
not reachable.

Discover Memory once per work round. If `mcp doctor` reports a healthy registered
server but Memory tools are absent from an already-running agent task, do not
reinstall or repeatedly rescan the project. The task's tool registry may predate the
registration. Use the CLI fallback for that round and use a new task or app restart
to pick up MCP later.

1. Call `memory.get_startup_state` once for the current work round with the
   working directory and client name. Do not repeat startup on each user message.
   A refresh is justified only when the repository/project changes, app context
   was lost, the user explicitly asks to reload memory, or the active session was
   closed or replaced. Pass the prior `revision` as `knownRevision` on a justified
   refresh.
2. Use the compact active/latest/recent summaries returned by startup as the
   normal carry-forward context. Do not call `memory.get_latest_session` when
   startup already supplies enough context.
3. Extract unfinished work, current next steps, current blockers, and recently
   touched files from the compact summaries.
4. Create a new session for the current day or work round with
   `memory.start_session`. If the user explicitly asks to continue the existing
   session, keep using the active session returned by startup state.
   Startup state lists the project's open workstreams; when the task belongs to
   one of them, pass its id in `workstreamIds`. Do not guess ids and do not ask
   to create workstreams — creation is a human control-plane action.
5. Search memory for the task, feature, error, file names, or workstream names
   before requesting session detail.
6. Call `memory.get_session_detail` only when compact summaries and targeted
   search are insufficient. Request only the needed sections and page checkpoint
   history; request a full body only when the task explicitly needs it.
7. Preview a context bundle only when compact summaries and targeted search are
   insufficient. Persist the bundle only when it is actually used.
8. If the working directory is unregistered, ask before creating or linking a
   project.

MCP sequence:

```text
memory.get_startup_state
memory.start_session
memory.search
memory.get_session_detail
memory.preview_context_bundle
memory.get_context_bundle
```

CLI fallback:

```text
zharwing-memory detect <working-directory>
zharwing-memory resume --project <project-id>
zharwing-memory start "<task>" --project <project-id> --agent <agent-name>
zharwing-memory search --project <project-id> "<query>"
zharwing-memory session <session-id> --project <project-id> --section checkpoints
zharwing-memory context --project <project-id> --preview --task "<task>"
```

Use the first installed command (`zharwing-memory`, then the legacy `aimem`
alias). When working inside the AI Memory source checkout and neither command is
installed, invoke the built CLI with absolute source-checkout paths:

```text
node --env-file-if-exists=<ai-memory-project-root>/.env <ai-memory-project-root>/apps/cli/dist/index.js <command>
```

Keep the shell working directory at the target repository for commands such as
`detect` and `start` that record working-directory context. This reuses the
existing local environment wiring without reading it. Never read, print,
summarize, or copy `.env` contents.

## During Work

Save checkpoints after meaningful progress, before risky changes, when blocked,
and before a likely interruption.

For daily-fresh-session workflows, write the first checkpoint or session summary
as a carry-forward note from the prior session:

- previous session/date
- unfinished task
- next actions for today
- blockers or risks
- files likely to matter

Include:

- concise summary
- next steps
- blockers
- touched files when known
- workstream ids when the task belongs to a multi-day topic
  (`memory.save_checkpoint` and `memory.close_session` accept `workstreamIds`,
  so attach mid-session if the workstream only became clear after start)

Checkpoint `nextSteps` and `blockers` describe current state. When supplied they
replace the previous current values; an explicit empty array clears the field;
omission preserves it. Touched files remain local to each checkpoint while the
session keeps aggregate file metadata for search and graph consumers.

When a workflow also appends a separate local session document, inspect only a
bounded tail unless the user requests a complete review.

Use durable docs for reusable project facts, decisions, commands, gotchas, and
architecture notes. Use Memory Inbox proposals when review mode is enabled or an
update is uncertain, risky, or privacy-sensitive.

## Closeout

At the end of a work round, treat user phrases such as "end of day", "job is
over", "close the session", or "close out today" as a memory closeout trigger.

If the project has separate source-control, release, deployment, or task-tracker
closeout policy, follow that project-specific policy first. Zharwing Memory should
record the resulting artifacts, but the public skill should not prescribe a
specific commit, PR, deploy, or task-tracker workflow.

After applicable project-specific closeout work is complete, call
`memory.close_session` when the task is done. If work is unfinished, save a
checkpoint with concrete next steps and blockers instead of pretending the
session is complete.

Closeout should include:

- what changed
- what was validated
- external closeout artifacts when applicable
- remaining risks or blockers
- next steps
- touched files when known

## Boundaries

- Keep context project-scoped unless the user explicitly requests cross-project
  context and policy allows it.
- Do not ingest secrets, `.env` files, credential caches, private keys, or
  unrelated logs.
- Respect visibility rules and never-send patterns.
- Do not silently create projects, write pointer files, or link repos without
  user approval.
- Do not hardcode personal project ids or organization-specific paths.
