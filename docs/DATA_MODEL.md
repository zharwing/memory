# Data Model

AI Memory stores durable project memory in Markdown and JSON files. The domain model is defined in `packages/core/src/types.ts`.

## Entity Overview

| Entity | Purpose | Source |
| --- | --- | --- |
| Project | Registered memory workspace and linked repos | `project.json`, registry |
| RepoLink | Repo/worktree attached to a project | `project.json` |
| Session | Project-scoped AI coding session | `sessions/YYYY/MM/*.md` |
| SessionCheckpoint | Progress point inside a session | session Markdown |
| MemoryDocument | Project knowledge document | `docs/**/*.md` and default root docs |
| Diagram | Specialized document with diagram metadata | `docs/diagrams/*.md` |
| ProposedMemoryUpdate | Reviewable memory proposal | `inbox/proposed-updates/*.json` |
| ContextBundle | Exact AI context package | `generated/context-bundles/*.md` |
| AuditRecord | Bundle metadata without raw secrets | `audit/context-bundles/*.json` |
| ProjectGraph | Derived metadata graph | generated from project/session/docs |
| SearchIndex | Rebuildable metadata/search projection | `generated/index.json` |

## Project

```yaml
id: project-slug
name: My App
slug: my-app
memoryRoot: D:/ai/llm-memory/projects/my-app
repos:
  - path: D:/work/my-app
    role: primary
    defaultBranch: main
created: 2026-06-08T00:00:00.000Z
updated: 2026-06-08T00:00:00.000Z
lastOpened: 2026-06-08T00:00:00.000Z
privacyPolicy: {}
contextPolicy: {}
assistantPolicy: {}
```

## Session

```yaml
id: session-uuid
project_id: my-app
repo_path: D:/work/my-app
working_directory: D:/work/my-app
branch: main
agent: codex
client: aimem-cli
status: active
started: 2026-06-08T00:00:00.000Z
updated: 2026-06-08T00:00:00.000Z
closed:
task_title: Fix settings page save bug
goal: Make settings save reliably
summary:
next_steps: []
blockers: []
touched_files: []
related_docs: []
related_tasks: []
context_bundle_id:
body: Full Markdown body after frontmatter; preserved and used for raw session context.
```

Filename format:

```text
YYYY-MM-DD__agent__branch__short-task.md
```

Example:

```text
2026-06-08__codex__main__settings-save-bug.md
```

## Document

```yaml
---
id: doc-uuid
title: Auth Refactor Plan
type: plan
status: active
visibility: ai-eligible
project: my-app
topics:
  - auth
  - sessions
related_tasks:
  - task-2026-0003
related_files:
  - src/auth/session.ts
related_sessions:
  - session-uuid
related_diagrams: []
created: 2026-06-08T00:00:00.000Z
updated: 2026-06-08T00:00:00.000Z
last_verified: 2026-06-08T00:00:00.000Z
confidence: medium
---
```

Document types:

- `plan`
- `investigation`
- `research`
- `architecture-note`
- `decision-record`
- `architecture-decision-record`
- `design-requirements-document`
- `technical-spec`
- `requirement`
- `user-flow`
- `diagram`
- `command-note`
- `gotcha`
- `meeting-note`
- `external-reference`
- `scratch-note`
- `overview`
- `commands`
- `glossary`
- `privacy`

Statuses:

- `draft`
- `active`
- `accepted`
- `superseded`
- `stale`
- `archived`

Visibility:

- `ai-eligible`
- `ai-pinned`
- `human-only`
- `private`
- `never-send`

## Proposed Memory Update

```json
{
  "id": "proposal-uuid",
  "projectId": "my-app",
  "type": "decision",
  "status": "pending",
  "sourceSession": "session-uuid",
  "sourceAgent": "codex",
  "sourceKind": "external-ai",
  "created": "2026-06-08T00:00:00.000Z",
  "confidence": "medium",
  "affectedFiles": ["src/settings/save.ts"],
  "targetDocument": "decisions.md",
  "proposedPatch": "...",
  "reason": "The session established a durable save-flow decision."
}
```

Proposal statuses:

- `pending`
- `accepted`
- `rejected`
- `deferred`
- `edited`

## Context Bundle

```yaml
id: bundle-uuid
projectId: my-app
sessionId: session-uuid
created: 2026-06-08T00:00:00.000Z
requestedBy: codex
includedItems: []
excludedItems: []
redactions: []
tokenEstimate: 18200
safetyStatus: clean
auditLogPath: audit/context-bundles/bundle-uuid.json
```

Safety statuses:

- `clean`
- `needs-review`
- `blocked`
- `index-stale`

## Graph Model

Graph nodes:

- project
- repo
- task
- session
- decision
- doc
- diagram
- code area
- file
- command
- gotcha
- external reference

Graph edges:

- `works-on`
- `touched`
- `referenced`
- `produced`
- `affects`
- `supersedes`
- `supports`
- `explains`
- `uses`
- `blocked-by`
- `belongs-to`
- `related`

The graph is derived from project/session/document metadata. It is not the source of truth.

## Index Model

The current implementation writes a dependency-free JSON index:

```text
generated/index.json
```

It contains compact projections of:

- sessions
- documents
- proposals

This is the placeholder boundary for SQLite/FTS5 once native dependency work is allowed.
