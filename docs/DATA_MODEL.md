# Data Model

AI Memory stores durable project memory in Markdown and JSON files. The domain model is defined in `packages/core/src/types.ts`.

## Entity Overview

| Entity | Purpose | Source |
| --- | --- | --- |
| Project | Registered memory workspace and linked repos | `project.json`, registry |
| RepoLink | Repo/worktree attached to a project | `project.json` |
| Workstream | Multi-day topic/epic grouping | `workstreams/*.md` |
| Session | Project-scoped AI coding session | `sessions/YYYY/MM/*.md` |
| SessionCheckpoint | Progress point inside a session | session Markdown |
| MemoryDocument | Project knowledge document | `docs/**/*.md` and default root docs |
| Diagram | Specialized document with diagram metadata | `docs/diagrams/*.md` |
| ProposedMemoryUpdate | Reviewable memory proposal | `inbox/proposed-updates/*.json` |
| ContextBundle | Exact AI context package | `generated/context-bundles/*.md` |
| AuditRecord | Bundle metadata without raw secrets | `audit/context-bundles/*.json` |
| ProjectGraph | Derived metadata graph | generated from project/session/docs |
| SearchIndex | Rebuildable metadata/search projection | `generated/index.json` |
| ImportPlan | Preview of a source-folder import before commit | daemon/RPC result |
| ImportCandidate | One proposed imported file | import plan |
| TrashItem | Recoverable deleted item metadata and payload | `global/trash/items/<trash-id>/` |

## Project

```yaml
id: project-slug
name: My App
slug: my-app
memoryRoot: <memory-root>/projects/my-app
repos:
  - path: <repo-root>
    name: Product Runtime
    description: Active product app and shared UI runtime
    role: product-runtime
    defaultBranch: main
created: 2026-06-08T00:00:00.000Z
updated: 2026-06-08T00:00:00.000Z
lastOpened: 2026-06-08T00:00:00.000Z
privacyPolicy: {}
contextPolicy: {}
assistantPolicy: {}
memoryWritePolicy:
  allowAgentDirectWrites: true
  reviewMode: off
graphRules:
  - match: apps/*
    nodeType: package
    topic: frontend
  - match: services/*
    nodeType: service
    topic: backend
```

Repo `role` is free-form category metadata. Examples include `service`,
`worker`, `docs`, `product-runtime`, `codex-wrapper`, and `worktree`, but the
app does not restrict the value.

`memoryWritePolicy.reviewMode` controls whether durable memory updates are
written directly or routed to Memory Inbox. The default is `off`, which allows
direct agent writes. `risky-only` keeps routine updates direct and reserves the
inbox for risky or uncertain updates. `all` disables direct document writes and
routes durable memory changes through proposals.

`graphRules` is optional project configuration for deriving useful context graph
nodes from imported folder layouts. It belongs in `project.json`, not in
application code. See [Graph Rules](GRAPH_RULES.md).

## Workstream

```yaml
id: workstream-uuid
project_id: my-app
name: Huddle
slug: huddle
status: active
summary: Multi-day Huddle runtime and service work
goal: Ship the Huddle feature across repos
topics:
  - huddle
  - realtime
repo_roles:
  - product-runtime
  - service
related_tasks: []
related_files: []
pinned_doc_ids: []
created: 2026-06-08T00:00:00.000Z
updated: 2026-06-08T00:00:00.000Z
closed:
body: Full Markdown body after frontmatter.
```

Workstreams live under `workstreams/<slug>.md`. Sessions and documents can link
explicitly through `workstream_ids`; the workstream detail view also finds
related items from matching topics, tasks, names, summaries, and body text.

## Session

```yaml
id: session-uuid
project_id: my-app
repo_path: <repo-root>
working_directory: <repo-root>
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
workstream_ids: []
related_docs: []
related_tasks: []
context_bundle_id:
body: Full Markdown body after frontmatter; preserved and used for raw session context.
import_source_path:
import_source_hash:
imported_at:
import_profile:
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
workstream_ids:
  - workstream-uuid
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
import_source_path:
import_source_hash:
imported_at:
import_profile:
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

## Import

An import plan previews how a source folder will be transformed into native AI
Memory files.

```json
{
  "id": "import-uuid",
  "projectId": "my-app",
  "sourceRoot": "<source-memory-folder>",
  "profileName": "markdown-memory",
  "created": "2026-06-15T00:00:00.000Z",
  "counts": {
    "total": 123,
    "documents": 123,
    "sessions": 0,
    "skipped": 0,
    "warnings": 0
  },
  "candidates": []
}
```

Candidate kinds:

- `document`
- `session`
- `skip`

Conflict strategies:

- `skip`
- `overwrite`
- `duplicate`

Imported documents are written below `docs/imported/<profile>/...`. Imported
sessions are written below `sessions/imported/<profile>/...`. Both preserve the
source Markdown body and add import provenance metadata.

## Trash

Delete operations move recoverable items to global Trash before permanent
purge. Trash is global to the memory root so deleted projects can still be
listed and restored after they are removed from the active project registry.

Trash item types:

- `project`
- `repo`
- `workstream`
- `session`
- `document`
- `inbox-proposal`
- `backup`

Trash metadata:

```json
{
  "id": "trash-uuid",
  "type": "session",
  "projectId": "my-app",
  "projectName": "My App",
  "itemId": "session-uuid",
  "title": "Fix settings page save bug",
  "deletedAt": "2026-06-18T00:00:00.000Z",
  "originalPath": "<project-memory-root>/sessions/2026/06/file.md",
  "metadataPath": "<memory-root>/global/trash/items/trash-uuid/trash-item.json",
  "critical": false,
  "canRestore": true
}
```

Storage shape:

```text
<memory-root>/
  global/
    trash/
      items/
        <trash-id>/
          trash-item.json
          payload.json
          payload/
```

Path-backed items, such as projects, workstreams, sessions, documents, inbox
proposals, and backups, move their original file or directory into the trash
item directory. JSON-backed items, such as linked repo entries, store their
payload in `payload.json`.

Restore moves recoverable items back to their original active location and
removes the trash metadata. Purge permanently deletes the trash item directory.

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
- workstream
- topic
- service
- package
- diagram group
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
- `mentions`
- `uses`
- `contains`
- `depends-on`
- `blocked-by`
- `belongs-to`
- `related`

The graph is derived from project/session/document metadata. It is not the source of truth.
Graph rules contribute extra context nodes and relationships during projection.

Graph rule shape:

```yaml
match: apps/*
nodeType: package
label:
segment:
slugFromSegment:
labelFromSegment:
edgeType: supports
topic: frontend
```

## Semantic Graph Model

Semantic graph analysis is optional. It stores reviewed AI-assisted
relationships as structured project metadata while Markdown docs remain the
human-readable source of truth.

Durable semantic graph files:

```text
semantic-graph/settings.json
semantic-graph/edges.json
```

Generated, rebuildable semantic graph files:

```text
generated/semantic/runs/<run-id>.json
generated/semantic/doc-extractions/<doc-id>/<content-hash>.json
generated/semantic/candidate-index.json
```

Semantic edge fields:

- `from`
- `to`
- `type`
- `status`: `proposed`, `accepted`, `rejected`, or `auto-accepted`
- `confidence`
- `reason`
- `evidence`
- `source`

Semantic document extractions may include chunk metadata:

- `chunkId`
- `index`
- `headingPath`
- `startLine`
- `endLine`
- per-chunk summary, entities, concepts, mentions, and candidate hints

Large documents are split into bounded Markdown/line-aware chunks. The model
extracts facts per chunk, then llm-memory merges those chunk facts into a single
document-level `SemanticDocumentExtraction` cached by document content hash.
This keeps semantic graph standalone and avoids sending full huge documents to a
small local model.

Pending review edges are stored as Memory Inbox `graph-update` proposals until
the user accepts them. Accepted and auto-accepted semantic edges become saved
relationships in the Graph context map. Rejected edges stay in durable metadata
so a user decision is not lost on rebuild.

The semantic candidate index is deterministic by default. It is built from
project metadata, graph rules, imported paths, extracted mentions, and existing
graph links. A vector store is not required for semantic relationships and is
not part of the default data model. Vector candidates can be added later as a
rebuildable optional source if users need similarity discovery for weakly
structured or very large document sets.

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
