# Importing Existing Markdown Memory

Zharwing Memory includes a generic Markdown importer for bringing existing notes,
session logs, and project memory folders into a project workspace. It is not
tied to any one repository or folder layout.

## Import Model

The importer has two phases:

1. Prepare an import plan.
   Zharwing Memory scans a source folder, classifies matching files, infers titles and
   metadata, computes source hashes, predicts target paths, and reports warnings.

2. Commit the import.
   Zharwing Memory reads the source files again and writes native project documents or
   sessions under the project memory workspace.

Imported files keep provenance metadata:

```yaml
import_source_path: <source-memory-folder>/auth.md
import_source_hash: sha256...
imported_at: 2026-06-15T00:00:00.000Z
import_profile: markdown-memory
```

The original Markdown body is preserved. Existing source frontmatter is used as
input metadata, then Zharwing Memory writes its own normalized frontmatter around the
body.

## What Profiles Are

An import profile is a set of rules that tells Zharwing Memory how to interpret files
in the selected source folder. The profile decides:

- which files are included or ignored
- whether matching files become long-lived project documents or historical
  session records
- the default document type, status, visibility, and format
- whether topics are inferred from folder names
- which special path patterns should override the defaults
- where the imported files will be written inside the project memory workspace

Profiles do not change the source folder. Previewing an import only scans files
and shows what would happen. Committing the import writes normalized Zharwing Memory
Markdown files into the selected project.

Use a profile based on what the source folder represents:

| Source folder contains | Choose | Result |
| --- | --- | --- |
| General Markdown notes, loose docs, or text files | `generic-markdown` | Every included file becomes a project document. |
| An old `MEMORY`-style folder with durable project knowledge | `markdown-memory` | Every included file becomes a project document, with memory-oriented type inference. |
| Old session logs, work logs, or dated AI run notes | `markdown-sessions` | Every included file becomes a closed historical session. |
| A mixed folder that contains both docs and session-like paths | `workspace-markdown` | Session-looking paths become sessions; the rest become documents. |

## Built-In Profile Behavior

| Profile | Default item kind | Included files | Default target | Special behavior |
| --- | --- | --- | --- | --- |
| `generic-markdown` | Document | `*.md`, `*.txt` | `docs/imported/generic-markdown/...` | Best neutral fallback. Infers topics from folders and document type from names like `README`, `architecture`, `decision`, `plan`, `spec`, `command`, `gotcha`, or `diagram`. |
| `markdown-memory` | Document | `*.md`, `*.txt` | `docs/imported/markdown-memory/...` | Same core behavior as generic Markdown, but intended for existing durable memory folders. Use this for old project knowledge, decisions, commands, gotchas, architecture notes, and reference docs. |
| `markdown-sessions` | Session | `*.md`, `*.txt` | `sessions/imported/markdown-sessions/...` | Imports files as closed session history. It preserves the body, infers dates from paths when possible, and marks the agent/client as import metadata when the source does not specify them. |
| `workspace-markdown` | Document unless path looks session-like | `*.md`, `*.txt` | `docs/imported/workspace-markdown/...` or `sessions/imported/workspace-markdown/...` | Files under paths like `sessions/`, `session/`, or names containing `session` become sessions; other files become documents. |

All built-in profiles skip common non-memory folders and binaries, including
`.git`, `node_modules`, archives, image files, PDFs, and local `.codex` files.

Examples:

```text
Source: <old-memory-folder>/backend/auth-decision.md
Profile: markdown-memory
Target: <project-memory-root>/docs/imported/markdown-memory/backend/auth-decision.md
Result: project document
```

```text
Source: <old-sessions-folder>/2026-06-15-fix-auth.md
Profile: markdown-sessions
Target: <project-memory-root>/sessions/imported/markdown-sessions/2026-06-15-fix-auth.md
Result: closed historical session
```

```text
Source: <old-workspace>/sessions/2026-06-15.md
Profile: workspace-markdown
Target: <project-memory-root>/sessions/imported/workspace-markdown/sessions/2026-06-15.md
Result: closed historical session
```

```text
Source: <old-workspace>/architecture/runtime.md
Profile: workspace-markdown
Target: <project-memory-root>/docs/imported/workspace-markdown/architecture/runtime.md
Result: project document
```

The desktop/web UI exposes these as presets:

| UI preset | Profile |
| --- | --- |
| `Memory Docs` | `markdown-memory` |
| `Session History` | `markdown-sessions` |
| `Mixed Workspace` | `workspace-markdown` |

The `Profile` dropdown also exposes `generic-markdown` for loose folders that
are not specifically memory folders or session-history folders.

Profiles are data, not code. Authenticated daemon JSON-RPC clients can pass a
custom profile object with include/exclude globs, default kind, visibility,
status, and path rules.

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
zharwing-memory import-folder <source-memory-folder> --project <project-id> --profile markdown-memory
```

Preview session history:

```text
zharwing-memory import-folder <source-sessions-folder> --project <project-id> --profile markdown-sessions
```

Commit after reviewing the preview:

```text
zharwing-memory import-folder <source-memory-folder> --project <project-id> --profile markdown-memory --commit
zharwing-memory import-folder <source-sessions-folder> --project <project-id> --profile markdown-sessions --commit
```

Conflict behavior defaults to `skip`. Other options:

```text
zharwing-memory import-folder <source-memory-folder> --project <project-id> --profile markdown-memory --commit --conflict overwrite
zharwing-memory import-folder <source-memory-folder> --project <project-id> --profile markdown-memory --commit --conflict duplicate
```

List available profiles:

```text
zharwing-memory import-profiles
```

## Daemon JSON-RPC Workflow

The UI or an authenticated control-plane client can call:

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

Imports are intentionally not exposed through the focused MCP daily-memory
surface. Use the UI or CLI for preview and commit.

## After Import: Graph Rules

Imports preserve original relative paths under `docs/imported/<profile>/...` or
`sessions/imported/<profile>/...`. The graph projection can use those paths to
create useful context hubs such as packages, services, domains, teams, or
diagram groups.

If the Graph page is too flat after an import, add project graph rules manually
in **Settings -> Project -> Graph Rules**. See [Graph Rules](GRAPH_RULES.md).

## Notes

- Imports write into `docs/imported/<profile>/...` or
  `sessions/imported/<profile>/...`.
- Imported sessions are closed by default unless an import profile explicitly
  says otherwise.
- The importer does not bulk-load old session bodies as active sessions. It
  imports them as searchable, readable historical sessions.
- The importer does not replace external task systems. It is a durable local
  memory ingestion path.
