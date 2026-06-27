# MVP Walkthrough

## Start Daemon

```text
pnpm dev:daemon
```

The daemon defaults to:

```text
http://127.0.0.1:37841
Authorization: Bearer local-dev-token
```

## Start The UI

Browser UI:

```text
pnpm dev:web
```

Native Tauri window:

```text
pnpm dev:desktop
```

Use `dev:web` when you only need the browser app at
`http://localhost:5174/`. Use `dev:desktop` when you need the Tauri desktop
window and OS folder picker support.

## UI First Run

For a multi-repo product:

1. Open Setup.
2. Choose `Project only`.
3. Enter the project name and preview it.
4. Create the project.
5. The app opens Repos.
6. Link each Git repo root.
7. Open Import.
8. Preview old memory folders with `Memory Docs`.
9. Preview old session folders with `Session History`.
10. Commit only after the preview counts and samples look right.

## Create Project Memory

```text
pnpm dev:cli init --name "My App" --project-only --no-pointer
```

This creates:

- memory workspace under the configured memory root
- default Markdown project documents
- project registry entry

For a single-repo project, you can also create the project and link one repo in
one step:

```text
pnpm dev:cli init <repo-root> --name "My App" --bootstrap AGENTS.md,CLAUDE.md
```

## Link Additional Repos

```text
pnpm dev:cli link-repo <repo-root> --project my-app --name "Service API" --role service
pnpm dev:cli repos --project my-app
```

## Import Existing Markdown

Preview imports before committing them:

```text
pnpm dev:cli import-folder <old-memory-folder> --project my-app --profile markdown-memory
pnpm dev:cli import-folder <old-sessions-folder> --project my-app --profile markdown-sessions
```

After the preview looks right, commit the reviewed import:

```text
pnpm dev:cli import-folder <old-memory-folder> --project my-app --profile markdown-memory --commit
pnpm dev:cli import-folder <old-sessions-folder> --project my-app --profile markdown-sessions --commit
```

## Start Session

```text
pnpm dev:cli start "Fix settings page save bug" --project my-app --agent codex
```

## Preview Context

```text
pnpm dev:cli context --project my-app --preview
```

## Save Checkpoint

```text
pnpm dev:cli checkpoint --project my-app --session session-id "Implemented the save flow and found a validation gotcha"
```

## Close Session

```text
pnpm dev:cli close --project my-app --session session-id "Save bug fixed; next step is regression coverage"
```

## Review Memory Inbox

```text
pnpm dev:cli inbox --project my-app
```

## Manage Deletes In The UI

The UI moves deletions to Trash first for projects, linked repo entries,
workstreams, sessions, docs, inbox proposals, and backup snapshots. Open Trash
to restore an item or permanently delete it.

## Search Project Memory

```text
pnpm dev:cli search --project my-app "settings save"
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
