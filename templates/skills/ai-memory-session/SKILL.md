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

1. Call `memory.get_startup_state` with the current working directory and client
   name.
2. Read the latest relevant prior session before starting today's session. Use
   `memory.get_latest_session` or `memory.get_recent_sessions` to find the last work session, including the
   last weekday session after weekends or gaps.
3. Extract carry-forward context: unfinished task, next steps, blockers, touched
   files, and important decisions.
4. Create a new session for the current day or work round with
   `memory.start_session`. If the user explicitly asks to continue the existing
   session, keep using the active session returned by startup state.
   Startup state lists the project's open workstreams; when the task belongs to
   one of them, pass its id in `workstreamIds`. Do not guess ids and do not ask
   to create workstreams — creation is a human control-plane action.
5. Search memory for the task, feature, error, file names, or workstream names.
6. Preview context before using it in a prompt. Persist the context bundle only
   when it is actually used.
7. If the working directory is unregistered, ask before creating or linking a
   project.

MCP sequence:

```text
memory.get_startup_state
memory.get_latest_session
memory.start_session
memory.search
memory.preview_context_bundle
memory.get_context_bundle
```

CLI fallback:

```text
zharwing-memory detect <working-directory>
zharwing-memory resume --project <project-id>
zharwing-memory sessions --project <project-id> --limit 1 --json
zharwing-memory start "<task>" --project <project-id> --agent <agent-name>
zharwing-memory search --project <project-id> "<query>"
zharwing-memory context --project <project-id> --preview --task "<task>"
```

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
