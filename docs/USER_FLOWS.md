# User Flows

## First-Time Project Setup

Goal: register a repo without doing deep codebase analysis.

1. User opens desktop app or runs `aimem init`.
2. App/CLI detects repo root from the working directory.
3. App prepares a project creation preview.
4. User can choose memory location and pointer-file behavior.
5. App creates an empty, safe memory workspace.
6. App optionally writes `.ai-memory.json`.
7. App optionally writes `AGENTS.md` or `CLAUDE.md`.
8. App shows the first dashboard.
9. Optional assistant or external AI drafts initial memory.
10. Drafts go to Memory Inbox for review.

No deep codebase scan happens during project creation.

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
10. Durable updates go to Memory Inbox.

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
4. Optional assistant creates a return-to-project summary proposal.
5. User reviews the proposal in Memory Inbox.

## Context Preview

1. User opens Context Preview.
2. Context engine loads project-scoped sessions/docs.
3. It selects canonical docs, active session, recent relevant sessions, pinned docs, and relevant diagrams.
4. Privacy gate excludes or redacts unsafe items.
5. UI shows included items, excluded items, reasons, token estimate, redactions, and safety state.
6. User copies/exports/sends context only after inspection.

## Memory Inbox Review

1. External AI or assistant proposes an update.
2. Proposal is stored under `inbox/proposed-updates`.
3. User opens Memory Inbox.
4. User sees source session, source agent, target doc, patch, confidence, and reason.
5. User accepts, edits and accepts, rejects, defers, marks duplicate, or marks stale.
6. Canonical docs change only after acceptance.

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
4. User can validate workspace integrity.
5. User can rebuild the metadata index from Markdown source files.

## Assistant Jobs

1. User checks assistant status.
2. If disabled, core features still work.
3. User can run deterministic local jobs:
   - summarize session
   - prepare return summary
   - classify document
4. Jobs create Memory Inbox proposals.
5. User reviews proposals before canonical memory changes.

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

All-project behavior must be explicit.
