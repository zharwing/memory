# Agent Memory Protocol

This protocol defines how any AI agent should use Zharwing Memory. It is
project-neutral and agent-neutral. Do not put project names, machine-local paths,
or vendor-specific task systems in this file.

## Purpose

Zharwing Memory is the durable context layer for AI-assisted work. Agents use it to
find relevant project knowledge, preserve session history, write durable memory
updates, and build context bundles before doing work.

Zharwing Memory is not automatically the project task tracker, issue tracker, CI
system, source control system, or deployment system. When a project has an
external task system, store only stable references to external task ids in
`related_tasks` metadata unless that project explicitly adopts Zharwing Memory for task
tracking.

## Startup Flow

1. Resolve the active project from the current working directory or explicit
   project id.
2. Read startup state before assuming whether to resume or start a session.
3. Read the latest relevant previous session when the user or project prefers
   daily/session-per-work-round logs. Carry forward unfinished tasks, next
   steps, blockers, touched files, and decisions.
4. Search project memory for the task, feature, error, or file names involved.
5. Start a new project-scoped session for meaningful work by default. Resume
   only when the user explicitly asks to continue an existing session or the
   project policy says to reuse active sessions.
6. Preview or generate a context bundle when prior context matters.

If memory tooling is unavailable, continue with the user's task using local
project files and report that Zharwing Memory was unavailable.

### Day rollover

Agents frequently exit without closing their session. `memory.start_session`
and `memory.start_or_resume_session` therefore close any session still marked
`active` from an earlier local day before they create or resume anything, so
`start_or_resume` never hands back yesterday's log as today's session. The
auto-close records `closed_reason`, keeps `updated` at the last real activity,
and fills a missing TLDR deterministically. Closing a session explicitly is
still preferred: only an explicit close records the real summary, next steps,
and blockers.

## During Work

- Save checkpoints after meaningful progress, decision points, or interruptions.
- Add touched files, blockers, and next steps when saving progress.
- Keep durable facts as docs, not only in the session body. Write routine memory
  directly when review mode is off.
- Use Memory Inbox proposals when review mode is enabled, or when an update is
  risky, uncertain, private-sensitive, or should not become canonical without a
  human pass.
- Link sessions and docs to workstreams when the task belongs to a known
  multi-day topic.
- Link external task ids in `related_tasks` only when the project provides them.
- Search before creating new durable docs to avoid duplicates.
- When graph context looks noisy or missing useful hubs, inspect imported paths
  and propose graph rules with `memory.propose_graph_update`. Do not silently
  rewrite project graph rules unless the user explicitly asks for direct
  settings changes.

## Closeout Flow

1. Treat end-of-day, "work is over", and explicit close-session requests as
   memory closeout triggers.
2. Follow project-specific source-control, release, deployment, or task-tracker
   closeout policy only when that policy is provided outside this universal
   protocol.
3. Close the session with a concrete summary.
4. Include next steps, blockers, touched files, and external closeout artifacts
   when known.
5. Write durable memory updates when the session established reusable facts,
   commands, decisions, gotchas, or architecture notes and review mode is off.
6. Route updates to Memory Inbox only when review mode or update risk calls for
   it.

## AI Visibility And Boundaries

- Treat memory in the selected project as AI-visible by default, including
  sessions, file paths, and routine metadata.
- Do not ingest secrets, credentials, local credential caches, `.env` files, raw
  private keys, tokens, or unrelated runtime logs.
- Respect document visibility. Do not send `private`, `human-only`, or
  `never-send` material to external models.
- Do not search unrelated projects unless the user explicitly asks for
  cross-project context and the project policy allows it.
- Prefer project-scoped search and context bundles by default.
- Preserve source provenance when importing existing docs or sessions.

## Tool Preference

Use the strongest available interface in this order:

1. MCP `memory.*` tools.
2. The `zharwing-memory` CLI.
3. The local daemon JSON-RPC API.
4. Read-only local docs fallback when no memory tool is available.

Adapters should translate this protocol to the current environment without
adding project-specific policy.

## Required Capabilities

An MCP adapter is complete enough for routine coding work when it can resolve
startup state, read latest/recent sessions, start sessions, search project
memory, preview/load context, save checkpoints, and close sessions. Project
administration, imports, backups, graph settings, and Trash are administrative
operations handled by the UI or CLI.

## Project Profiles

Project-specific setup belongs in the project profile and project workspace, not
in this protocol. A project profile may define linked repos, workstreams, import
roots, graph rules, privacy policy, context policy, assistant policy, and
optional external task-system references.
