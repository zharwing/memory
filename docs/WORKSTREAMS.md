# Workstreams

A workstream is a project-scoped container for multi-day work. It is the right
place for things people may also call an epic, initiative, topic, lane, or
focus area.

Use one AI Memory project for a long-lived product area, then create
workstreams inside it.

Example:

```text
Project: Acme Product
Workstreams:
  Search
  Permissions and Roles
  Post-auth Onboarding
  Design System
```

## Why Workstream Instead Of Epic

`Epic` often implies a specific product-management hierarchy. `Workstream` is
looser: it can group sessions, docs, repositories, imported memory, and
decisions across several days without forcing an agile structure.

## Stored Shape

Workstreams are Markdown files under:

```text
<project-memory-root>/workstreams/<slug>.md
```

They include frontmatter for:

- `id`
- `name`
- `slug`
- `status`
- `summary`
- `goal`
- `topics`
- `repo_roles`
- `related_tasks`
- `related_files`
- `pinned_doc_ids`

Sessions and documents can attach explicitly with `workstream_ids`. The
workstream detail view also finds related sessions and documents by matching
topics, related task labels, names, summaries, and body text.

## UI Workflow

1. Create or select a project.
2. Open `Workstreams`.
3. Create a workstream such as `Huddle`.
4. Add topics like `huddle`, `realtime`, or `permissions`.
5. Start sessions from the Dashboard and select the workstream.
6. Use the Workstream detail view to see related sessions and docs.
7. Move obsolete workstreams to Trash instead of permanently deleting them.

## CLI

```text
aimem workstreams --project <project-id>
aimem create-workstream "Huddle" --project <project-id> --topic huddle,realtime
aimem workstream huddle --project <project-id>
aimem start "Huddle service contract pass" --project <project-id> --workstream <workstream-id>
```

## MCP

Agents can use:

- `memory.list_workstreams`
- `memory.create_workstream`
- `memory.get_workstream_detail`
- `memory.update_workstream_status`
- `memory.delete_workstream`

Agents should attach new sessions to a workstream when the task is part of a
known multi-day focus area.
