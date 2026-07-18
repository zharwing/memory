# Repository Links

An Zharwing Memory project can be linked to multiple repositories, services, packages,
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

## MCP

Agents can use:

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

## Pointer Files

Each linked repo can contain a small `.zharwing/memory.json` pointer file:

```json
{
  "projectId": "<project-id>",
  "memoryRoot": "<memory-root>/projects/<project-id>"
}
```

Pointer files let agents resolve the right Zharwing Memory project from any linked
repo without hardcoded machine-specific paths in app documentation.
