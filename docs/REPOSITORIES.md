# Repository Links

A Zharwing Memory project can be linked to multiple repositories, services, packages,
tools, or worktrees. The links are stored in the project model as
`repos: RepoLink[]`.

For multi-repo products, create the memory project first, then link each Git
repo root from Repos. Do not point a repo link at the private memory store.
Repo links describe source-code checkouts; the memory store is where Zharwing Memory
writes sessions, docs, imports, context bundles, and Trash.

## UI

Setup has two paths:

- `Project only`: use this for multi-repo products, programs, clients, or any
  product that owns several services and frontends.
- `Project plus one repo`: use this as a shortcut for simple single-repo
  projects.

After project creation, the UI redirects to Repos. Add every repo that belongs
to the memory project. For a monorepo, link the monorepo root once instead of
linking every package folder.

Leave **Write pointer file** enabled for each linked repo. Linking writes
`.zharwing/memory.json` at that repo root. If a repo is already linked but its
pointer is missing, submit the same repo path again with **Write pointer file**
enabled; the existing link is updated and the pointer is created.

In browser mode, paste or type absolute paths. In the Tauri desktop window, use
the Browse button to choose folders with the OS picker.

## Metadata

Each repo link can have:

- `name`: human-friendly label, such as `Product runtime`
- `description`: what this source root owns
- `role`: free-form category, such as `service`, `worker`, `docs`,
  `product-runtime`, `codex-wrapper`, or `worktree`
- `defaultBranch`: optional branch hint

Roles are descriptive metadata, not a fixed taxonomy. Multiple repos can share
the same role, and a project does not need to force every repo into one layout.

## CLI

List linked repos:

```text
zharwing-memory repos --project <project-id>
```

Link a repo:

```text
zharwing-memory link-repo <repo-root> --project <project-id> --name "Service API" --role service
```

Link a repo with custom metadata:

```text
zharwing-memory link-repo <repo-root> --project <project-id> --name "Local Codex Wrapper" --role codex-wrapper --description "Local operator and Codex integration tooling"
```

Link without writing a pointer file:

```text
zharwing-memory link-repo <repo-root> --project <project-id> --role worktree --no-pointer
```

Unlink a repo:

```text
zharwing-memory unlink-repo <repo-root> --project <project-id>
```

Keep the pointer file when unlinking:

```text
zharwing-memory unlink-repo <repo-root> --project <project-id> --keep-pointer
```

## Daemon Administration API

The UI and authenticated daemon JSON-RPC surface support:

- `memory.list_project_repos`
- `memory.link_repo`
- `memory.unlink_repo`

`memory.link_repo` resolves a nested path to its repo root when possible, stores
the normalized repo path, updates the project registry, and writes a
`.zharwing/memory.json` pointer file by default.

`memory.unlink_repo` removes the repo from the project model and removes that
repo's `.zharwing/memory.json` pointer file by default.

`memory.delete_repo` removes the repo link from the active project and stores
the repo-link payload in Trash. It does not delete the source-code checkout.

Repository administration is intentionally not advertised through the focused
MCP daily-memory surface. Use the UI or CLI to create, link, unlink, or delete
repository entries.

## Pointer Files

Each linked repo can contain a small `.zharwing/memory.json` pointer file:

```json
{
  "schema": "zharwing.memory.pointer.v1",
  "projectId": "<project-id>",
  "memoryRoot": "<memory-root>/projects/<project-id>",
  "contextPolicy": {
    "directSessionInclusionDays": 7,
    "summaryOnlyDays": 30,
    "maxRawSessions": 3,
    "maxSummarizedSessions": 5
  }
}
```

Pointer files let agents resolve the right Zharwing Memory project from any linked
repo without hardcoded machine-specific paths in app documentation.

Normally, do not hand-write this file. Create or refresh it by linking the repo
with the UI or by running the same link command again:

```text
zharwing-memory link-repo <backend-repo-root> --project <project-id> --name "Backend" --role service
zharwing-memory link-repo <frontend-repo-root> --project <project-id> --name "Frontend" --role app
zharwing-memory link-repo <local-tools-repo-root> --project <project-id> --name "Local tools" --role tooling
```

Pointer creation is on by default. Use `--no-pointer` only when deliberately
opting out. Verify any repo or nested folder with:

```text
zharwing-memory detect <repo-root-or-subfolder>
```

The result should report the same `<project-id>` for every linked repo.

The pointer contains a machine-local memory path. Add
`.zharwing/memory.json` to each linked repo's `.gitignore` unless that repo has
an explicit team policy for sharing machine-specific pointers.

## Using One Memory Project From Several Codex Workspaces

A Zharwing Memory project can span many repositories even when one Codex window
opens only one folder. These scopes are intentionally separate:

- Zharwing project scope supplies shared sessions, search, docs, context, and
  graph knowledge across every linked repo.
- Codex workspace scope controls which source folder is currently open and
  normally editable.
- Linking a repo to Zharwing does not mount that repo into an existing Codex
  workspace or expand Codex filesystem permissions.

Recommended workflow:

1. Link every repo to the same memory project and write a pointer in each repo.
2. Open Codex in the repo being changed. Opening a nested folder also works
   because project detection walks upward to the repo pointer.
3. For simultaneous work in another repo, open a separate Codex window or
   thread rooted in that repo.
4. Let each work round create its own session. All those sessions share the same
   Zharwing project, while session metadata records the active repo and working
   directory.

For example:

```text
Codex: backend repo  ─┐
Codex: frontend repo ├─> one shared Zharwing Memory project
Codex: local tools   ─┘
```

Project-wide memory can tell a backend Codex session about a frontend decision,
but editing the frontend still requires a Codex workspace or explicit
filesystem permission that includes the frontend repo. For cross-repo tasks,
separate repo-rooted Codex sessions are the safest default; coordinate them
through the shared memory project.
