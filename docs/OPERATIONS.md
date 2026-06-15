# Operations

## Runtime Assumptions

The source tree has been authored but not executed. Dependencies are declared in package manifests, but no dependency installation, build, typecheck, test, or dev server run has been performed.

## Environment Variables

Daemon:

```text
AIMEM_HOST=127.0.0.1
AIMEM_PORT=37841
AIMEM_AUTH_TOKEN=local-dev-token
AIMEM_MEMORY_ROOT=/path/to/AI Memory Root
```

API client:

```text
AIMEM_DAEMON_URL=http://127.0.0.1:37841
AIMEM_AUTH_TOKEN=local-dev-token
```

## Intended Startup

Daemon:

```text
pnpm --filter @aimem/daemon dev
```

CLI:

```text
aimem projects
```

Desktop:

```text
pnpm --filter @aimem/desktop dev
```

MCP:

```text
pnpm --filter @aimem/mcp-server dev
```

These commands are documented for future use. They were not run during implementation.

## Security

Production packaging should:

- generate a per-user local auth token
- store the token in the OS app data directory or keychain-compatible location
- bind daemon to localhost by default
- keep remote access disabled by default
- require explicit approval for project creation, repo linking, context serving, and canonical memory writes
- log sensitive operations without storing raw secrets

## Backups

Current backup behavior creates a directory snapshot under:

```text
<project-memory-root>/backups/snapshots/<timestamp>/
```

The backup function excludes the `backups/` subtree to avoid recursively copying snapshots into snapshots.

Future archive export can add `.zip` packaging once dependency or platform APIs are available.

## Indexing

Current index behavior writes:

```text
generated/index.json
```

The index is rebuildable from Markdown/frontmatter and JSON proposal files.

Future work:

- add SQLite registry/index database
- add SQLite FTS5 keyword search
- add rebuild-from-Markdown command with validation report

## Local Assistant

Current assistant behavior:

- status reporting
- recommended model metadata
- runtime install preview
- deterministic session summary proposal
- deterministic return summary proposal
- deterministic document classification proposal

Not implemented yet:

- downloading llama.cpp
- downloading GGUF models
- starting llama-server
- GPU acceleration
- prompt logs
- external local endpoint adapters

## Validation Checklist For Future Runtime Work

1. Install dependencies.
2. Run workspace typecheck.
3. Run unit tests.
4. Build packages.
5. Start daemon.
6. Initialize a temporary project.
7. Start a session.
8. Generate context preview.
9. Save checkpoint.
10. Close session.
11. Create inbox proposal.
12. Rebuild index.
13. Create backup snapshot.
14. Open desktop app.
15. Connect MCP adapter to a client.

## Known Constraints

- JSON index is a placeholder for SQLite/FTS5.
- MCP adapter is dependency-free and does not use the official SDK yet.
- Desktop UI uses hand-authored components instead of shadcn scaffolding because dependencies were not installed.
- Runtime behavior is not validated until installs/builds/tests are allowed.
