# MVP Walkthrough

## Start Daemon

```text
pnpm --filter @aimem/daemon dev
```

The daemon defaults to:

```text
http://127.0.0.1:37841
Authorization: Bearer local-dev-token
```

## Create Project Memory

```text
aimem init /path/to/repo --name "My App" --bootstrap AGENTS.md,CLAUDE.md
```

This creates:

- memory workspace under the configured memory root
- `.ai-memory.json` pointer file if not disabled
- default Markdown project documents
- project registry entry
- optional bootstrap instruction files

## Start Session

```text
aimem start "Fix settings page save bug" --project my-app --agent codex
```

## Preview Context

```text
aimem context --project my-app --preview
```

## Save Checkpoint

```text
aimem checkpoint --project my-app --session session-id "Implemented the save flow and found a validation gotcha"
```

## Close Session

```text
aimem close --project my-app --session session-id "Save bug fixed; next step is regression coverage"
```

## Review Memory Inbox

```text
aimem inbox --project my-app
```

## Search Project Memory

```text
aimem search --project my-app "settings save"
```

## MCP Startup Flow

An external agent should call:

```text
memory.get_startup_state
```

Then:

```text
memory.prepare_project_creation
memory.create_project
memory.start_or_resume_session
memory.preview_context_bundle
memory.get_context_bundle
memory.save_checkpoint
memory.close_session
memory.propose_memory_update
```

Normal session and context calls are project-scoped by default.
