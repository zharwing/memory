# Agent Automation

Zharwing Memory is project-neutral. It should work for any user's repositories without
hardcoded project ids, company names, or local paths.

## Goal

An agent should be able to start inside a linked repo and automatically:

1. Detect the active Zharwing Memory project.
2. Read the latest relevant previous session, including the last weekday session
   after weekends or gaps.
3. Create a fresh session for the current day or work round by default.
4. Search prior project memory.
5. Load relevant context when needed.
6. Save checkpoints during work.
7. At end-of-day or work-round closeout, save final progress and close the
   session or leave next steps.

This daily-memory workflow is implemented. The focused MCP adapter exposes all
of these capabilities; broader project administration stays in the UI and CLI.

## Required Pieces

- Local daemon running with `ZHARWING_MEMORY_ROOT` and either token auth or
  localhost-only no-auth mode.
- `ZHARWING_MEMORY_AGENT_SURFACE=enabled` in the daemon/MCP environment.
- MCP config for each AI client, or CLI access as a fallback.
- Linked source repos with `.zharwing/memory.json` pointer files when auto-detection
  is wanted.
- Repo-local bootstrap instructions such as `AGENTS.md` or `CLAUDE.md`.
- Optional generic skill or custom instruction that makes the behavior habitual.

## MCP Setup

Start the daemon first or use the desktop app to start or reuse it:

```text
corepack pnpm dev:daemon
```

Recommended local setup uses the daemon's Streamable HTTP MCP endpoint:

```text
zharwing-memory mcp install auto
zharwing-memory mcp doctor
```

The installer writes or updates detected client MCP configs, creates a
timestamped backup when replacing an existing file, and uses the running CLI
entrypoint for stdio configs instead of hardcoded checkout paths.

For localhost-only personal use, set:

```text
ZHARWING_MEMORY_AUTH_MODE=none
```

No-auth mode is refused when the daemon is not bound to a loopback host.

Manual templates remain available in `templates/mcp/`:

- `codex.toml` for Codex MCP configuration.
- `claude-desktop.json` for Claude Desktop-style MCP configuration.

The MCP endpoint exposes `memory.*` tools and calls the local daemon. It does
not store project data by itself.

The selected project is AI-visible by default. MCP returns normal sessions,
paths, search results, and context without per-request approval. Only explicit
visibility exclusions, never-send rules, and secret detection limit results.

For full setup details, including `--transport stdio`, token-auth config,
desktop installer buttons, and Windows/WSL reachability, see
[MCP Setup](MCP_SETUP.md).

## Repo Bootstrap

After creating an Zharwing Memory project and linking a source repo, generate bootstrap
instructions for that repo:

```text
zharwing-memory agent-instructions --project <project-id> --agent codex --output AGENTS.md
zharwing-memory agent-instructions --project <project-id> --agent claude --output CLAUDE.md
```

For manual setup, copy from:

```text
templates/bootstrap/AGENTS.md
templates/bootstrap/CLAUDE.md
```

Keep generated bootstrap files generic except for the selected project id and
repo-specific metadata.

## Optional Skill

Codex users can install the generic skill template from:

```text
templates/skills/ai-memory-session
```

The skill tells an agent to use Zharwing Memory at session start, during progress
checkpoints, and at closeout. It should not contain private project names or
paths.

For users who prefer daily Markdown session files, use the compact carry-forward
state returned by startup and then call `memory.start_session` for today's work.
Use resume only when the user explicitly asks to continue the existing session.

## Agent Workflow

Preferred MCP flow:

```text
memory.get_startup_state
memory.start_session
memory.search
memory.get_session_detail
memory.preview_context_bundle
memory.get_context_bundle
memory.save_checkpoint
memory.close_session
```

CLI fallback:

```text
zharwing-memory detect <working-directory>
zharwing-memory resume --project <project-id>
zharwing-memory start "<task>" --project <project-id> --agent <agent-name>
zharwing-memory search --project <project-id> "<query>"
zharwing-memory session <session-id> --project <project-id> --section checkpoints
zharwing-memory context --project <project-id> --preview --task "<task>"
zharwing-memory checkpoint --project <project-id> --session <session-id> "summary"
zharwing-memory close --project <project-id> --session <session-id> "summary"
```

## Closeout Extensions

Zharwing Memory should not prescribe a universal source-control, release, deployment,
or task-tracker workflow. Those workflows are project-specific and belong in a
private project profile, repo bootstrap file, or personal agent skill.

When such a project-specific closeout exists, Zharwing Memory can help by listing
today's sessions/checkpoints, identifying touched repos, and recording final
artifacts such as commit hashes, PR links, deploy targets, external task ids,
blockers, and next steps.

## Scope And Secret Safety

Do not send or store secrets, `.env` files, private keys, credential caches, or
unrelated private logs. Keep context project-scoped unless the user explicitly
requests cross-project context and policy allows it.
