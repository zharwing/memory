# Agent Automation

AI Memory is project-neutral. It should work for any user's repositories without
hardcoded project ids, company names, or local paths.

## Goal

An agent should be able to start inside a linked repo and automatically:

1. Detect the active AI Memory project.
2. Read the latest relevant previous session, including the last weekday session
   after weekends or gaps.
3. Create a fresh session for the current day or work round by default.
4. Search prior project memory.
5. Load relevant context when needed.
6. Save checkpoints during work.
7. At end-of-day or work-round closeout, save final progress and close the
   session or leave next steps.

## Required Pieces

- Local daemon running with `AIMEM_MEMORY_ROOT` and `AIMEM_AUTH_TOKEN`.
- MCP config for each AI client, or CLI access as a fallback.
- Linked source repos with `.ai-memory.json` pointer files when auto-detection
  is wanted.
- Repo-local bootstrap instructions such as `AGENTS.md` or `CLAUDE.md`.
- Optional generic skill or custom instruction that makes the behavior habitual.

## MCP Setup

Start the daemon first:

```text
corepack pnpm dev:daemon
```

Use the templates in `templates/mcp/`:

- `codex.toml` for Codex MCP configuration.
- `claude-desktop.json` for Claude Desktop-style MCP configuration.

Replace:

- `<ai-memory-project>` with the absolute path to this AI Memory app checkout.
- `<local-ai-memory-token>` with the same token in `.env`.

The MCP server exposes `memory.*` tools and calls the local daemon. It does not
store project data by itself.

## Repo Bootstrap

After creating an AI Memory project and linking a source repo, generate bootstrap
instructions for that repo:

```text
aimem agent-instructions --project <project-id> --agent codex --output AGENTS.md
aimem agent-instructions --project <project-id> --agent claude --output CLAUDE.md
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

The skill tells an agent to use AI Memory at session start, during progress
checkpoints, and at closeout. It should not contain private project names or
paths.

For users who prefer daily Markdown session files, configure the skill or
bootstrap instructions to read the latest previous session first and then call
`memory.start_session` for today's work. Use resume only when the user explicitly
asks to continue the existing session.

## Agent Workflow

Preferred MCP flow:

```text
memory.get_startup_state
memory.get_latest_session
memory.start_session
memory.search
memory.preview_context_bundle
memory.get_context_bundle
memory.save_checkpoint
memory.close_session
```

CLI fallback:

```text
aimem detect <working-directory>
aimem resume --project <project-id>
aimem sessions --project <project-id> --limit 1 --json
aimem start "<task>" --project <project-id> --agent <agent-name>
aimem search --project <project-id> "<query>"
aimem context --project <project-id> --preview --task "<task>"
aimem checkpoint --project <project-id> --session <session-id> "summary"
aimem close --project <project-id> --session <session-id> "summary"
```

## Closeout Extensions

AI Memory should not prescribe a universal source-control, release, deployment,
or task-tracker workflow. Those workflows are project-specific and belong in a
private project profile, repo bootstrap file, or personal agent skill.

When such a project-specific closeout exists, AI Memory can help by listing
today's sessions/checkpoints, identifying touched repos, and recording final
artifacts such as commit hashes, PR links, deploy targets, external task ids,
blockers, and next steps.

## Privacy

Do not send or store secrets, `.env` files, private keys, credential caches, or
unrelated private logs. Keep context project-scoped unless the user explicitly
requests cross-project context and policy allows it.
