# Browser And Desktop UI

The local browser UI and native desktop app are two runtime modes for the same
React human interface. Neither is an agent. Both let a user create memory
projects, link repos, import old notes, review context, inspect sessions, manage
durable memory, and recover deleted items.

## Runtime Modes

Start normal browser mode with one command:

```text
corepack pnpm dev
```

Open:

```text
http://127.0.0.1:5174/
```

Native Tauri development mode:

```text
pnpm dev:desktop
```

`dev` starts the loopback daemon and browser UI together with no credential
setup. `dev:desktop` starts the Tauri desktop window and the same React app. The Rust
host starts and owns an exact-loopback `hardened-local` daemon and establishes
a one-shot native credential outside the webview. It refuses to attach to an
already-running unrelated daemon. A packaged build needs its daemon sidecar or
an explicit trusted `ZHARWING_MEMORY_DESKTOP_DAEMON_COMMAND`; it does not fall
back to browser transport. Setting
`ZHARWING_MEMORY_DESKTOP_AUTOSTART_DAEMON=false` deliberately leaves native
authority unavailable and is only a debugging aid.

The browser UI cannot browse arbitrary local folders. In browser mode, path
fields accept typed or pasted absolute paths. In the Tauri window, Setup,
Repos, and Import can use OS folder picker buttons.

The Shell stays mounted while a project generation is being selected; only the
scoped route outlet is gated. Search, Docs, Graph, and Diagrams use the same
document editor host and canonical document target. URL parameters are bounded
and canonicalized, and legacy project routes preserve their query/hash during
redirects. Cross-tab changes trigger body-free revalidation, with focus/resume
reads providing the authoritative fallback.

| Behavior | Browser UI | Native Tauri app |
| --- | --- | --- |
| Pages and workflows | Full shared React UI | Full shared React UI |
| Daemon | Started by `dev` | Rust starts, owns, and rotates it per project |
| Folder selection | Type or paste absolute paths | OS folder picker buttons |
| Window | `http://127.0.0.1:5174/` | Native application window |

For browser environment variables, token matching, first startup, and common
errors, see the dedicated [Browser UI guide](WEB_UI.md).

Setup also includes Agent MCP actions for automatic install, installing Codex,
Claude Code, or Claude Desktop config, and checking the current MCP setup.
These actions call the same installer as `zharwing-memory mcp install` and require
restarting the target AI client after config changes. See
[MCP Setup](MCP_SETUP.md).

## Sidebar Model

The sidebar intentionally stays lightweight. It contains only primary areas:

- project switcher
- Dashboard
- Repos
- Work
- Library
- Import
- Search
- Trash
- Settings

The project switcher at the top opens Projects. That screen is where users
select, create, and delete memory projects.

Detailed pages live inside section tabs:

| Section | Tabs |
| --- | --- |
| Work | Current Work, Sessions, Workstreams |
| Library | Docs, Diagrams, Inbox, Graph, Context |
| Settings | Project, Setup, Assistant, Backups |

This keeps the sidebar from becoming a full feature inventory while preserving
direct routes for every screen.

## First-Run Flow

For a multi-repo product:

1. Open Setup.
2. Choose `Project only`.
3. Enter the project name.
4. Preview the project.
5. Create the project.
6. The app redirects to Repos.
7. Add each Git repo root one by one.
8. Open Import to preview and commit existing memory or session folders.

For a simple single-repo project:

1. Open Setup.
2. Choose `Project plus one repo`.
3. Enter the project name and first repo folder.
4. Keep pointer-file creation enabled unless there is a reason not to.
5. Preview and create the project.
6. Add more repos later from Repos if the project grows.

## Repo Paths

A repo path should be a Git repo root or a folder inside that repo. Zharwing Memory
normalizes it to the repo root when possible.

Do not use the private memory store as a repo path. The memory store is where AI
Memory writes project memory. Repo paths point to source-code checkouts.

## Import Flow

Import is preview-first:

1. Select or create the target memory project.
2. Choose a source folder.
3. Choose the import type:
   - `Memory Docs` for old MEMORY folders
   - `Session History` for old SESSIONS folders
   - `Mixed Workspace` when one folder contains both docs and session-like files
4. Preview the import plan.
5. Check counts, skipped files, warnings, and sample rows.
6. Commit only after the preview looks right.

Imported docs become project documents. Imported sessions become closed project
session history.

## Sessions

Sessions is table-first, like Docs. Clicking a row (or its **Open** action)
opens that session's detail panel and records the selection in the URL as
`?session=<id>`, so a session view is linkable and survives a reload. **Close**
dismisses the panel. Project-wide summary actions (**Summarize missing** and,
under Advanced, **Regenerate all summaries**) sit in the toolbar above the
table so they do not require opening a session first.

Timestamps are shown in the viewer's locale (for example
`Tue, Jul 28, 2026, 03:44 AM`). ISO strings are storage format only and are not
displayed in tables or detail panels.

A session closed automatically at day rollover shows its close reason in the
detail panel. See [Agent Protocol](AGENT_PROTOCOL.md).

## Session Graph Visibility

Every session stays in Session History, search, and eligible context whether or
not it appears in the graph. On the Sessions screen, **Include in graph** is off
by default. Enable it only for an important session that should become a visible
graph node. The session's derived task, touched-file, repo, workstream, and
document relationships are included or excluded with it.

## Docs Library Editing

Docs is table-first. The table is the document navigation surface, with filters
and pagination for imported projects that contain many Markdown files. Diagrams
are stored as document records internally, but the Docs tab hides diagram docs
because the Library has a dedicated Diagrams tab.

New projects include draft starter docs: overview, architecture, decisions,
tasks, gotchas, commands, glossary, and privacy rules. These are reusable
project-memory slots that agents can read and update across sessions. They are
different from session files: sessions are chronological logs for one work run,
while docs are longer-lived project knowledge that future sessions can reuse.
The Docs table shows this explanation automatically on the Draft filter and
behind a compact help button elsewhere.

Opening a row or using its `Edit` action opens a large editor modal. The modal
edits the Markdown body directly, keeps document metadata compact in the header,
and provides a Preview mode for human-readable rendered Markdown. Markdown
remains the canonical storage format.

For documents with Mermaid blocks, Preview renders the diagram through Mermaid
itself so users can review the diagram visually while keeping the source
editable in Markdown mode. Each rendered diagram can be opened in a larger
viewer with zoom controls for dense architecture diagrams. In the larger
viewer, `Ctrl`/`Cmd` + mouse wheel zooms and `Shift` + mouse wheel pans the
diagram horizontally when horizontal overflow exists.

The offline preview intentionally supports the common diagram families exposed
by the product: flowchart/graph, sequence, class, state, entity-relationship,
Gantt, journey, mind map, and timeline. A fenced
Mermaid block using another upstream beta or experimental family fails closed
with an accessible, deterministic explanation; its Markdown source remains
available for editing and is never sent to a CDN or remote rendering service.

## Memory Write Mode

Projects default to direct memory writes. Connected agents can save session
checkpoints and routine durable docs without waiting for inbox approval.

Settings includes a Memory Write Mode control:

- `Off - write directly`: normal default
- `Risky updates only`: routine writes stay direct, risky or uncertain updates
  should use the inbox
- `Review every memory update`: agents should route durable memory changes to
  Memory Inbox proposals

The dashboard shows the current review mode and pending review count.

## Delete And Trash

Deleting active items moves them to Trash first:

- projects
- linked repo entries
- workstreams
- sessions
- docs
- Memory Inbox proposals
- backup snapshots

Every recoverable delete shows a confirmation dialog. Permanent/global actions
also require their prepared, expiring, target-bound destructive intent. There
is no persisted "do not ask again" bypass. An old
`aimem.delete.confirm.skip.*` browser-storage value is inert and may be removed.

Trash supports:

- restore
- permanent delete for one item
- select all
- delete selected permanently
- empty all trash

Permanent delete cannot be undone.

## Derived Screens

Graph, Search, and Context are derived from active project data. They are not
deleted directly. Delete or edit the underlying projects, sessions, docs,
workstreams, inbox proposals, or backups instead.

Graph renders the derived project knowledge map through synchronized visual and
structured projections. The structured view exposes node, relationship,
document, focus, and inspection actions without interpreting SVG position or
color. The canvas has one tab stop and a bounded one-active-node keyboard model;
the projection enforces stable node/edge budgets. Missing measurement, SVG, or
animation capabilities leave the structured view available.

It is not a service architecture diagram. Nodes are project metadata records
such as repos, workstreams, sessions, docs, diagrams, and files. Edges are
metadata relationships such as `works-on`, `touched`, `referenced`, `supports`,
`explains`, or `uses`.

Graph shows saved relationships only. Deterministic metadata links and accepted
semantic links are both durable project knowledge. Pending semantic suggestions
stay in Inbox, where users can review the proposed relationships and accept or
reject them before they affect the graph.

When imported docs need clearer hubs, edit graph rules in
**Settings -> Project -> Graph Rules**. Rules map imported paths such as
`apps/*` or `services/*` to context nodes such as packages, services, topics,
code areas, or diagram groups. See [Graph Rules](GRAPH_RULES.md).

Graph Details shows saved relationship metadata for the selected node or edge.
Use Inbox for pending AI relationship proposals, including model reasoning and
evidence. See [Semantic Graph Analysis](SEMANTIC_GRAPH.md).

Repo links are created in two ways:

- explicit metadata, such as a session `repoPath`, `workingDirectory`, or
  touched file path
- inferred document metadata, such as document topics or import paths that
  match linked repo names, repo descriptions, or repo roles

The default `Context map` mode shows repo/workstream anchors plus useful
relationships. It intentionally hides plain document-to-project `belongs-to`
membership links because those only mean an item is stored under the project.

`Import audit` mode shows those membership links for import debugging. It
is expected to be noisy: every imported doc and diagram belongs to the project,
so raw mode can produce a large project-to-document fanout. Service architecture
belongs in the Diagrams tab, where imported Mermaid diagrams are rendered
visually.
