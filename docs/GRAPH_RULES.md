# Graph Rules

The Graph page is a context map, not a storage inventory and not a service
architecture diagram. Its job is to show which repos, workstreams, topics,
services, packages, diagram groups, sessions, docs, and files are connected by
usable project memory.

Storage ownership links such as `doc -> project` are kept for audit/debugging,
but they are intentionally hidden from the normal context view because they only
mean "this record is stored in this project."

## How The Graph Is Built

Zharwing Memory builds the graph from deterministic project data:

- linked repo metadata
- workstream metadata
- session metadata
- document metadata
- document topics
- imported file paths
- package names mentioned in document titles or early body text
- optional project graph rules

No AI processing is required for the default graph. AI can help propose better
rules, but those suggestions should go through the Memory Inbox unless a human
explicitly applies them.

## Manual Use

Open the desktop/web app, select a project, then open:

```text
Settings -> Project -> Graph Rules
```

Graph rules are stored in the selected project's `project.json` as
`graphRules`. Save rules as a JSON array:

```json
[
  { "match": "apps/*", "nodeType": "package", "topic": "frontend" },
  { "match": "services/*", "nodeType": "service", "topic": "backend" },
  { "match": "domains/*", "nodeType": "topic" },
  { "match": "diagrams/*", "nodeType": "diagram-group", "edgeType": "explains" }
]
```

After saving, refresh Graph. The normal Context map should show the new context
nodes and relationships. Use Import audit only to debug indexed storage records
and ownership links.

## Rule Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `match` | yes | Glob-like path pattern matched against imported memory paths. |
| `nodeType` | yes | Context node to create. |
| `label` | no | Fixed display label. |
| `segment` | no | Path segment index used for slug and label. |
| `slugFromSegment` | no | Path segment index used only for node id/slug. |
| `labelFromSegment` | no | Path segment index used only for display label. |
| `edgeType` | no | Relationship from matching doc to the context node. |
| `topic` | no | Parent topic that should contain the context node. |

Accepted `nodeType` values:

- `topic`
- `service`
- `package`
- `diagram-group`
- `code-area`
- `external-reference`

Accepted `edgeType` values:

- `supports`
- `explains`
- `mentions`
- `uses`
- `contains`
- `depends-on`
- `related`

Snake-case aliases such as `node_type`, `edge_type`, `slug_from_segment`, and
`label_from_segment` are accepted by the daemon.

## Match Semantics

Rules match imported relative paths, not absolute machine paths.

For current imports, Zharwing Memory writes files under:

```text
docs/imported/<profile>/<original-relative-path>.md
sessions/imported/<profile>/<original-relative-path>.md
```

Graph matching strips the `docs/imported/<profile>/` or
`sessions/imported/<profile>/` prefix and matches the original relative path.

Legacy memory paths under `/markdown-memory/` and `/docs/memory/` are also
recognized.

Pattern behavior:

- `*` matches one path segment.
- `**` matches the rest of the path.
- A pattern such as `apps/*` matches files below `apps/<name>/...`.
- When no segment is configured, the first `*` segment becomes the node slug.

Examples:

```json
[
  { "match": "apps/*", "nodeType": "package" },
  { "match": "services/*", "nodeType": "service" },
  { "match": "teams/*/runbooks/**", "nodeType": "topic", "segment": 1 },
  { "match": "libraries/*", "nodeType": "package", "edgeType": "supports" }
]
```

## AI-Assisted Control-Plane Use

AI clients should not silently rewrite graph rules unless the user asked for a
direct settings change. The safer workflow is:

1. Read project data through the UI, CLI, or authenticated daemon methods such
   as `memory.get_project`, `memory.list_docs`, and `memory.get_graph`.
2. Inspect imported paths, topics, repo names, and noisy/missing graph areas.
3. Propose a JSON rules array with `memory.propose_graph_update`.
4. Human reviews the Memory Inbox item.
5. Human applies the graph rules from the Inbox or edits them in Settings.

Authenticated daemon proposal example:

```json
{
  "projectId": "my-app",
  "proposedPatch": "[{\"match\":\"apps/*\",\"nodeType\":\"package\",\"topic\":\"frontend\"},{\"match\":\"services/*\",\"nodeType\":\"service\",\"topic\":\"backend\"}]",
  "reason": "Imported docs are organized by apps and services folders, but the context graph has no package/service hubs.",
  "confidence": "medium",
  "sourceAgent": "codex"
}
```

Direct daemon JSON-RPC settings update, only when the user explicitly approves it:

```json
{
  "projectId": "my-app",
  "graphRules": [
    { "match": "apps/*", "nodeType": "package", "topic": "frontend" },
    { "match": "services/*", "nodeType": "service", "topic": "backend" }
  ]
}
```

Use:

- `memory.propose_graph_update` for reviewed AI suggestions.
- `memory.update_graph_rules` for explicit manual or approved changes.
- `memory.get_graph` to inspect the resulting projection.

These are control-plane RPC methods, not focused daily-memory MCP tools. Use the
UI or CLI for normal graph-rule administration.

## What Not To Use Graph Rules For

Do not use graph rules to model runtime service dependencies. Put architecture,
sequence, data-flow, and service-dependency diagrams in Diagrams. The Graph page
should answer "what memory is connected to this area of the project?", not
"what calls what at runtime?"

Do not encode project-specific constants into application code. If a project has
unusual folders, keep that mapping in the project's `graphRules` instead.
