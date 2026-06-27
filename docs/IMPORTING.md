# Importing Existing Markdown Memory

AI Memory includes a generic Markdown importer for bringing existing notes,
session logs, and project memory folders into a project workspace. It is not
tied to any one repository or folder layout.

## Import Model

The importer has two phases:

1. Prepare an import plan.
   AI Memory scans a source folder, classifies matching files, infers titles and
   metadata, computes source hashes, predicts target paths, and reports warnings.

2. Commit the import.
   AI Memory reads the source files again and writes native project documents or
   sessions under the project memory workspace.

Imported files keep provenance metadata:

```yaml
import_source_path: <source-memory-folder>/auth.md
import_source_hash: sha256...
imported_at: 2026-06-15T00:00:00.000Z
import_profile: markdown-memory
```

The original Markdown body is preserved. Existing source frontmatter is used as
input metadata, then AI Memory writes its own normalized frontmatter around the
body.

## Built-In Profiles

| Profile | Use |
| --- | --- |
| `generic-markdown` | Import Markdown and text files as general memory documents. |
| `markdown-memory` | Import an existing memory folder as project documents. |
| `markdown-sessions` | Import an existing session folder as closed session history. |
| `workspace-markdown` | Import mixed Markdown workspaces, treating session-like paths as sessions. |

The desktop/web UI exposes these as presets:

| UI preset | Profile |
| --- | --- |
| `Memory Docs` | `markdown-memory` |
| `Session History` | `markdown-sessions` |
| `Mixed Workspace` | `workspace-markdown` |

Profiles are data, not code. RPC and MCP callers can pass a custom profile
object with include/exclude globs, default kind, visibility, status, and path
rules.

## UI Workflow

1. Select the target memory project.
2. Open Import.
3. Choose a source folder.
4. Pick `Memory Docs`, `Session History`, or `Mixed Workspace`.
5. Preview the import plan.
6. Review counts, skipped files, warnings, and sample candidates.
7. Commit the reviewed import.

Browser mode requires typed or pasted paths. The Tauri desktop window can use
the folder picker.

## CLI Workflow

The CLI assumes the daemon is running.

Preview memory documents:

```text
aimem import-folder <source-memory-folder> --project <project-id> --profile markdown-memory
```

Preview session history:

```text
aimem import-folder <source-sessions-folder> --project <project-id> --profile markdown-sessions
```

Commit after reviewing the preview:

```text
aimem import-folder <source-memory-folder> --project <project-id> --profile markdown-memory --commit
aimem import-folder <source-sessions-folder> --project <project-id> --profile markdown-sessions --commit
```

Conflict behavior defaults to `skip`. Other options:

```text
aimem import-folder <source-memory-folder> --project <project-id> --profile markdown-memory --commit --conflict overwrite
aimem import-folder <source-memory-folder> --project <project-id> --profile markdown-memory --commit --conflict duplicate
```

List available profiles:

```text
aimem import-profiles
```

## MCP Workflow

Agents should call:

1. `memory.list_import_profiles`
2. `memory.prepare_import`
3. Review `counts`, `candidates`, `warnings`, and `targetPath`.
4. `memory.commit_import` with either the reviewed `plan` or the same
   `sourceRoot` and `profile`.

Recommended safety default:

```json
{
  "projectId": "<project-id>",
  "sourceRoot": "<source-memory-folder>",
  "profile": "markdown-memory",
  "conflictStrategy": "skip"
}
```

## After Import: Graph Rules

Imports preserve original relative paths under `docs/imported/<profile>/...` or
`sessions/imported/<profile>/...`. The graph projection can use those paths to
create useful context hubs such as packages, services, domains, teams, or
diagram groups.

If the Graph page is too flat after an import, add project graph rules manually
in **Settings -> Project -> Graph Rules**, or ask an AI client to create a
reviewable `memory.propose_graph_update` proposal. See [Graph Rules](GRAPH_RULES.md).

## Notes

- Imports write into `docs/imported/<profile>/...` or
  `sessions/imported/<profile>/...`.
- Imported sessions are closed by default unless an import profile explicitly
  says otherwise.
- The importer does not bulk-load old session bodies as active sessions. It
  imports them as searchable, readable historical sessions.
- The importer does not replace external task systems. It is a durable local
  memory ingestion path.
