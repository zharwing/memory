# User Flows

## First-Time Project Setup

Goal: create a memory project without doing deep codebase analysis.

1. User opens the desktop/web app or runs `aimem init`.
2. User chooses `Project only` for a multi-repo product, or `Project plus one repo` for a simple single-repo setup.
3. App prepares a project creation preview.
4. User confirms the project name, memory location, and optional pointer-file behavior.
5. App creates an empty, safe memory workspace.
6. If an initial repo was supplied, app optionally writes `.ai-memory.json`.
7. If bootstrap files were requested, app optionally writes `AGENTS.md`, `CLAUDE.md`, or another adapter file.
8. App redirects to Repositories so the user can link additional repos.
9. User opens Import to preview and commit old memory or session folders.
10. Optional assistant or external AI writes initial memory directly unless review mode is enabled.
11. Risky, uncertain, or review-mode updates go to Memory Inbox.

No deep codebase scan happens during project creation.

## Desktop Navigation

1. User selects a project from the project switcher at the top of the sidebar.
2. User uses primary sidebar sections for Dashboard, Repos, Work, Library, Import, Search, Trash, and Settings.
3. User uses section tabs for secondary pages:
   - Work: Current Work, Sessions, Workstreams
   - Library: Docs, Diagrams, Inbox, Graph, Context
   - Settings: Project, Setup, Assistant, Backups
4. Direct routes still work for every screen.

## Daily AI Coding Session

1. User starts from repo folder.
2. User runs `aimem start "task title"` or opens the desktop app.
3. System resolves the current project.
4. System creates or resumes a project-scoped session.
5. User previews the context bundle.
6. External AI receives context through MCP, CLI, or clipboard/export.
7. External AI does coding work.
8. External AI saves checkpoints after meaningful progress.
9. External AI closes the session with next steps.
10. Durable updates are written directly by default. Review-mode or risky updates go to Memory Inbox.

## MCP Agent Startup

1. Agent calls `memory.get_startup_state`.
2. If project is resolved, server returns active/latest/recent project sessions.
3. If project is unregistered, server recommends project creation.
4. Agent calls `memory.prepare_project_creation`.
5. User approves project creation through an allowed path.
6. Agent calls `memory.create_project`.
7. Agent calls `memory.start_or_resume_session`.
8. Agent calls `memory.preview_context_bundle`.
9. Agent continues with the coding task.

## Return To Project

1. User opens project dashboard.
2. Dashboard shows active/latest session, recent sessions, next steps, blockers, inbox count, graph count, and context safety.
3. User clicks Resume Latest or chooses another project session.
4. Optional assistant can write or draft a return-to-project summary.
5. If review mode is enabled, the draft waits in Memory Inbox.

## Context Preview

1. User opens Context Preview.
2. Context engine loads project-scoped sessions/docs.
3. It selects canonical docs, active session, recent relevant sessions, pinned docs, and relevant diagrams.
4. Privacy gate excludes or redacts unsafe items.
5. UI shows included items, excluded items, reasons, token estimate, redactions, and safety state.
6. User copies/exports/sends context only after inspection.

## Memory Inbox Review

1. External AI or assistant proposes an update when review mode is enabled or the update needs human judgment.
2. Proposal is stored under `inbox/proposed-updates`.
3. User opens Memory Inbox.
4. User sees source session, source agent, target doc, patch, confidence, and reason.
5. User accepts, edits and accepts, rejects, defers, marks duplicate, or marks stale.
6. Canonical docs change after acceptance. When review mode is off, routine canonical docs can be written directly without entering this queue.

## Docs And Diagrams

1. User imports or creates Markdown docs.
2. User sets type, status, visibility, topics, and related files/sessions.
3. Mermaid diagrams live as editable Markdown.
4. Diagrams can be linked to tasks, sessions, docs, decisions, and files.
5. Graph projection derives nodes and edges from metadata.

## Backup And Restore

1. User opens Backups or runs `aimem backup`.
2. App creates a local snapshot under `backups/snapshots`.
3. Snapshot excludes previous backups to avoid recursive copies.
4. User can move old snapshots to Trash.
5. User can validate workspace integrity.
6. User can rebuild the metadata index from Markdown source files.

## Delete And Trash

1. User deletes a project, linked repo entry, workstream, session, doc, inbox proposal, or backup.
2. Critical deletes show a confirmation dialog.
3. User can choose `Do not ask again for this type of item` to skip future prompts for that item type.
4. App moves the item to Trash instead of permanently deleting it.
5. User opens Trash to restore the item, permanently delete one item, select multiple items, or empty all trash.
6. Permanent delete cannot be undone.

## Assistant Jobs

1. User checks assistant status.
2. If disabled, core features still work.
3. User can run deterministic local jobs:
   - summarize session
   - prepare return summary
   - classify document
4. Jobs can create direct memory updates or Memory Inbox proposals depending on project review mode.
5. User reviews proposals only when the update was routed to the inbox.

## Project Separation

Default scope is always the current project:

- session lists
- dashboard
- docs
- diagrams
- graph
- search
- context
- inbox
- assistant jobs
- trash

All-project behavior must be explicit.
