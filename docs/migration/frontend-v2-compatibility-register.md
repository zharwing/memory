# Frontend V2 compatibility register

Snapshot: 2026-08-12. Review date: 2026-11-01.

This register names compatibility paths that remain reachable. The review date
is not an automatic removal date. Each removal requires source callers,
generated browser bytes, packaged native reachability, focused regression
coverage, migration notes, and rollback to agree for the selected profile.

Frontend V2 is a non-breaking internal refactor at the supported external API
and project-data boundaries. Existing operation names, compatibility entry
points, client aliases, CLI/MCP identities, routes, and canonical Markdown
content remain compatible. Internal routing, transport, authority, and
composition changed behind retained adapters and redirects. The removed string
route helper and obsolete confirmation preference were internal or inert and
do not alter the supported external API or project data.

One insecure configuration path is intentionally retired rather than carried
forward: browser-bundled `VITE_*` bearer credentials. That value was reachable
in public frontend bytes and is replaced by the browser cookie/CSRF bootstrap.
Trusted Node credentials and `AIMEM_*` aliases remain compatible; this browser
security migration does not change operation names or canonical project data.

| Compatibility path | Current production reachability | Hardened reachability | Decision |
| --- | --- | --- | --- |
| `personal-preview + authMode=none` preview browser session and legacy preview dispatcher | Explicit local browser compatibility profile | Rejected/absent | Retain through review window; it is the supported source-run browser preview and must never become an automatic fallback |
| Unscoped/legacy desktop route URLs | Existing bookmarks and compatibility extensions; production UI consumers use typed builders | Registered redirects/recovery only | Retain until bookmark/support policy and emitted route coverage prove removal safe |
| `AIMEM_*` trusted Node/Rust environment aliases | Daemon, Tauri host, MCP install/dev helpers, and existing local configuration | Not browser build inputs | Retain; canonical name wins and daemon warns. Remove only after callers/config migrations are measured |
| Legacy `%APPDATA%/aimem/daemon-token` or POSIX equivalent | Existing pre-rename trusted installations | Trusted host only; never browser | Retain to avoid silently rotating/breaking configured clients; migrate file under operator control before removal |
| `ZharwingMemoryClient` compatibility administrator facade | CLI constructs it; public package may have external trusted Node callers | Browser composition cannot import it | Retain. Migrate CLI and all supported external examples before emitted/package removal proof |
| `AimemClient` type/value aliases | No in-repo production import observed; public package compatibility remains externally reachable | Not a browser authority source by itself | Retain as an external API residual until a major-version policy and package-consumer evidence exist |
| CLI binary/server name `aimem` | Package manifest and MCP installer actively migrate existing config | Trusted local tool only | Retain; manifests are outside this source slice and callers remain |
| `local.aimem.desktop` Tauri identifier | Packaged application identity and OS-owned state | Native package only | Retain. Changing it is an installer/data migration, not a source cleanup |
| `AI Memory Root` default folder name | New/default and existing store discovery still use it | Data path only | Retain until an explicit store-path migration exists; branding does not justify moving private data |
| `app-managed-llamacpp` provider value | Existing project records/contracts/UI display it as disabled/unsupported | No managed runtime is launched | Retain for decode/migration. Do not offer it as a working provider |
| `aimem.graph.relationshipMode` and `aimem.graph.positions.d3.v2:*` | Active non-sensitive preference/layout cache keys | Optional local cache only | Retain through the window; payload validation/reset protects correctness. Rename only with read-once migration or deliberate reset |

## Removed in this reconciliation

The old string route-builder/parser facade no longer has a production caller.
`utils/routes.ts` exposes only the typed registry, the desktop contract check
rejects reintroduced callers, and registered compatibility URLs remain
separate from navigation construction.

`aimem.delete.confirm.skip.<itemType>` no longer has a production reader or
writer. `ConfirmDeleteButton` always opens the owned confirmation, and the
accessibility source check rejects a reintroduced persisted bypass. Old keys
are inert and may be deleted from local storage. Project content is unaffected.

## Configuration-template reconciliation

The checked-in `.env.example` now exposes only the non-secret
`ZHARWING_PUBLIC_DAEMON_URL` and optional `ZHARWING_PUBLIC_PROFILE` browser
hints. Retired `VITE_ZHARWING_MEMORY_*` names and every browser bearer input are
absent. Vite admits only `ZHARWING_PUBLIC_*`, and the setup, browser, README,
and website source describe the same cookie/CSRF bootstrap boundary.

## Removal proof template

For any retained row, record:

1. selected profile and supported version window;
2. repository production callers and public package/CLI/native consumers;
3. browser build, source-map, and packaged artifact reachability;
4. persisted data/config/bookmark migration;
5. focused refusal and compatibility regression tests;
6. exact rollback artifact/profile; and
7. independent review.

If any item is unknown, retain the path as a dated residual risk.
