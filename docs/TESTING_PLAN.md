# Testing Plan

Goal: protect the two places where a silent regression actually hurts — the
privacy gate (data leaks into AI context) and Markdown storage round-trips
(memory loss or corruption) — then grow outward to the daemon API surface.

## Principles

1. **No new dependencies.** Tests use `node:test` and `node:assert/strict`.
   The existing infrastructure already supports this end to end:
   - Write `foo.test.ts` next to `foo.ts` in each package's `src/`.
   - `corepack pnpm typecheck` / `build` (`tsc -b`) compiles them to `dist/`.
   - `corepack pnpm test` (`scripts/run-tests.mjs`) discovers every
     `dist/**/*.test.js` and runs `node --test`.
   This works identically on Windows and WSL because plain Node needs no
   platform-specific binaries (unlike Vite/esbuild in this checkout).
2. **Test through public APIs.** Storage tests call `startSession`,
   `saveCheckpoint`, `commitImportPlan` etc. against a real temp directory —
   no mocking of `node:fs`. Fixtures are built by the same creation APIs the
   app uses, so they cannot drift from reality.
3. **Deterministic and isolated.** Every filesystem test creates its own root
   via `fs.mkdtemp(path.join(os.tmpdir(), "aimem-test-"))` and removes it in
   `t.after()`. No network, no shared state, no reliance on wall-clock values
   beyond "is a valid ISO timestamp".
4. **Behavior, not implementation.** Assert on parsed results and file
   contents, not on internal call order. No snapshot files.

## Test pyramid

```text
Phase 5   daemon lifecycle + HTTP RPC (integration)     ~15 tests
Phase 4   context-engine / search / graph (unit+integ)  ~35 tests
Phase 3   storage round-trips (integration, temp dirs)  ~50 tests
Phase 1-2 privacy + core (pure unit)                    ~60 tests
```

Order matters: each phase gives the next one trustworthy building blocks.

---

## Phase 0 — Infrastructure check (half a day)

- Add one trivial `packages/core/src/ids.test.ts`, run
  `corepack pnpm build && corepack pnpm test`, confirm discovery works.
- Add a shared fixture helper `packages/storage/src/test-support.ts`:
  - `makeTempMemoryRoot()` — mkdtemp + cleanup registration.
  - `makeTestProject(root, overrides?)` — creates a real project via
    `prepareProjectCreation` + `createProjectFromPreview`.
  Exported from the package but tree-shaken from production paths (it is only
  imported by test files).
- Decide and document: test files ship in `dist/` (harmless for a private
  app; revisit if the packages are ever published).

## Phase 1 — `@aimem/privacy` (highest risk, pure functions)

`secrets.test.ts`

- `scanSecrets` detects every built-in pattern class (API keys, tokens,
  private key blocks, connection strings, `.env`-style assignments) — one
  positive and one near-miss negative per pattern.
- Severity classification: high-risk findings are marked `high`.
- `redactSecrets`: replaces the secret, preserves surrounding text, returns
  one redaction record per finding, is a no-op on clean input, and is
  idempotent (redacting twice changes nothing).

`patterns.test.ts`

- `matchPattern` glob semantics: `*`, `**`, exact names, `.env.*`,
  leading-dot files, nested paths.
- Windows `\` separators normalize and still match.
- `matchesAnyPattern(undefined, ...)` returns false, empty pattern list
  returns false.

`gate.test.ts`

- Visibility exclusions: `never-send`, `private`, `human-only` each excluded
  with the right reason; `ai-eligible` and `ai-pinned` pass.
- `neverSendPatterns` beats `ignorePatterns` when both match.
- `blockOnHighRiskSecrets: true` + high finding → `allowed: false`,
  `safetyStatus: "blocked"`.
- `redactSecrets: false` passes content through untouched.
- Redaction path returns `needs-review`; clean path returns `clean`.
- `combineSafetyStatus` precedence: blocked > index-stale > needs-review >
  clean, including empty input.

**Exit criterion: every branch in `gate.ts` is exercised.** This package is
small enough that near-100% coverage is realistic and worth it.

## Phase 2 — `@aimem/core` (pure)

`ids.test.ts`

- `slugify`: spaces, punctuation, unicode, repeated separators, empty input.
- `filenameSafe` strips path-hostile characters.
- `createSessionFilename` / `shortLocalSessionDate` with a fixed `Date`.
- `createId` produces unique, prefixed ids.

`policies.test.ts`

- `createProjectModel` applies defaults (context policy, privacy policy,
  write policy) and respects overrides.
- `memoryWritePolicyFor` merges partial stored policy over defaults.
- `isVisibleToAi` / `shouldBlockVisibility` truth table for all five
  visibility values plus unknown strings.

## Phase 3 — `@aimem/storage` (the crown jewels)

All tests operate on a temp memory root from `test-support.ts`.

`markdown.test.ts`

- `formatMarkdown` → `parseMarkdown` round-trip: strings, arrays, undefined
  values (omitted), booleans/numbers; body preserved byte-for-byte.
- CRLF input, frontmatter-less files, empty body, `---` inside body.

`sessions.test.ts` — the most important file in this phase

- `startSession` writes a file under `sessions/<year>/<month>/` with correct
  frontmatter; re-listing returns an equivalent `Session`.
- Body round-trip: free-form Markdown written into a session survives
  list → write → list unchanged (this was a documented past bug).
- `saveCheckpoint` appends `## Checkpoint - <ISO>` without regenerating the
  body; checkpoints rehydrate into structured metadata on read.
- `closeSession` appends the closeout section, sets status/closed, preserves
  everything before it.
- Filename collision: two sessions with the same title on the same day get
  `-2`, `-3` suffixes and never overwrite.
- `getActiveSession` / `getLatestSession` selection rules.

`documents.test.ts`, `workstreams.test.ts`

- Create → list → update round-trips; starter doc templates appear as drafts;
  workstream status transitions persist.

`registry.test.ts` / `project-workspace.test.ts`

- `prepareProjectCreation` → `createProjectFromPreview` creates the full
  workspace layout and registers the project.
- `detectProject` resolves a project from a `.ai-memory.json` pointer file in
  a nested working directory; returns nothing for unknown directories.
- `linkProjectRepo` / `unlinkProjectRepo`: pointer file written and removed,
  duplicate links rejected, repo metadata (name/role/branch) persisted.

`trash.test.ts`

- `movePathToTrash` → `listTrash` → `restorePathFromTrash` restores the exact
  original path and content; metadata removed after restore.
- `writeJsonToTrash` → `readTrashJsonPayload` round-trip (repo links).
- `purgeTrashItem` removes payload + metadata; purging a missing id throws.

`importer.test.ts`

- Fixture folder (built inline in the test) with nested Markdown docs and
  session-like files: `prepareImportPlan` counts match, plan is read-only
  (source untouched, nothing written to the project).
- `commitImportPlan` writes docs/sessions with import provenance fields.
- Conflict strategies on re-import: `skip` leaves originals, `overwrite`
  replaces, `duplicate` creates suffixed copies.

`backup.test.ts`, `fs.test.ts`, `indexer.test.ts`

- Snapshot copies the project but excludes `backups/` (no recursive growth).
- `normalizePath` on Windows and POSIX inputs; `listFiles` recursion +
  predicate.
- `rebuildProjectIndex` output matches a fresh listing.

## Phase 4 — `@aimem/context-engine`, `@aimem/search`, `@aimem/graph`

`tokens.test.ts`, `relevance.test.ts`

- `estimateTokens` monotonicity; `truncateToTokenBudget` never exceeds budget
  and returns whole input when under it.
- Relevance: query-matching doc outranks non-matching; pinned/active-session
  affinity boosts ordering.

`builder.test.ts` — **the privacy integration test that matters most**

- A project containing: an `ai-pinned` doc, an `ai-eligible` doc, a
  `never-send` doc, and a doc whose body contains a planted fake secret.
- Assert: pinned + eligible content appears in `bundle.markdown`; the
  never-send doc appears in `excludedItems` with reason `never-send` and its
  content appears **nowhere** in the rendered markdown; the secret is
  redacted or the item blocked; `safetyStatus` reflects the worst finding;
  `tokenEstimate > 0`; every included item has an inclusion reason.

`search/index.test.ts`

- Ranking: exact term beats single occurrence; multi-entity corpus returns
  sessions/docs/workstreams/proposals typed correctly.
- `snippet` centers on the first match; `tokenize` drops 1-char noise;
  empty/whitespace query returns `[]`.

`graph/index.test.ts`

- `buildProjectGraph` from a fixture project: expected node types
  (project/repo/workstream/session/doc), `belongs-to` membership edges, and
  rule-derived context edges when `graphRules` are set.
- Graph rules: `match` globs map imported paths to `topic`/`service`/
  `package` nodes; invalid rules are ignored (ties into
  `apps/daemon/src/services/graph-rules.ts` normalization, tested in Phase 5).

## Phase 5 — daemon (integration over the refactored services)

`apps/daemon/src/services/graph-rules.test.ts`

- `normalizeGraphExtractionRules`: valid rules pass, snake_case keys
  accepted, unknown node/edge types dropped, non-arrays → `[]`, numeric
  fields coerced.

`apps/daemon/src/memory-service.test.ts` — one full lifecycle against a temp
memory root, exercising the facade exactly as RPC does:

1. `prepareProjectCreation` → `createProject`
2. `linkRepo` to a temp directory (assert pointer file), duplicate link to a
   second project throws
3. `startSession` → `saveCheckpoint` → `closeSession`; `getStartupState`
   recommends the right action at each step
4. `createDocument` blocked when `allowAgentDirectWrites: false`
   (via `updateMemoryWritePolicy`), succeeds after re-enabling
5. `search` finds the checkpoint text; `previewContextBundle` includes the
   session; `getContextBundle` persists under `generated/`
6. `proposeMemoryUpdate` → `listInbox` → `updateInboxStatus("accepted")`
7. `deleteSession` → `listTrash` → `restoreTrashItem` → session listed again
8. `deleteProject` → registry empty → `restoreTrashItem` → project back
9. `exportProjectManifest` shape check

`apps/daemon/src/server.test.ts` — real HTTP on an ephemeral port
(`server.listen(0)`), using global `fetch`:

- `GET /health` 200; `POST /rpc` without/with wrong bearer → 401; correct
  token + `memory.list_projects` → `{ ok: true }`; unknown method →
  `{ ok: false }` with message; malformed JSON body → 500 without crashing
  the server.

## Phase 6 — desktop pure logic (optional, later)

The extracted `apps/desktop/src/screens/graph/graph-display.ts` and
`utils/*.ts` are pure and worth testing, but the desktop app is bundled by
Vite and does not emit `dist/` JS, so the node:test runner cannot see them
today. Two options, in preference order:

1. If graph display logic keeps growing, promote it into a small package
   (`packages/graph-display`) — it has no React dependency — and test it like
   Phase 4.
2. Otherwise adopt Vitest for the desktop workspace only (new dev dependency;
   must run from Windows in this checkout because of platform-native esbuild).

Component/UI tests (Testing Library) are explicitly out of scope until the
pure-logic layers above are covered.

## CI (when the repo gets a remote)

GitHub Actions, matrix `[ubuntu-latest, windows-latest]`:

```yaml
- corepack enable && corepack pnpm install   # per-OS install fixes native binaries
- corepack pnpm typecheck
- corepack pnpm test
- corepack pnpm build                        # vite bundle check (works in CI, unlike WSL-on-D:)
```

The per-OS `pnpm install` is what the current shared checkout cannot do, so
CI also becomes the reliable place where the Vite production build is proven
on Linux.

## Conventions

- Colocate: `src/foo.ts` → `src/foo.test.ts`; the compiled
  `dist/foo.test.js` is discovered automatically.
- Structure: `describe`-free flat `test("does X when Y", ...)` names, arrange
  → act → assert, one behavior per test.
- Always `t.after(() => fs.rm(tempRoot, { recursive: true, force: true }))`.
- Never assert exact timestamps or generated ids — assert shape
  (`assert.match(value, /^\d{4}-\d{2}-\d{2}T/)`).
- Run everything from the repo root: `corepack pnpm build && corepack pnpm test`
  (the per-package `dist/**/*.test.js` glob is shell-dependent; the root
  runner is not).

## Suggested implementation order and effort

| Step | Scope | New tests (approx.) | Effort |
| --- | --- | --- | --- |
| 0 | Runner check + `test-support.ts` | 1 | 0.5 day |
| 1 | privacy | ~30 | 1 day |
| 2 | core | ~25 | 0.5 day |
| 3 | storage | ~50 | 2–3 days |
| 4 | context-engine, search, graph | ~35 | 1.5 days |
| 5 | daemon lifecycle + HTTP | ~15 | 1 day |

After Phase 3 the project's "don't lose or leak memory" guarantee is tested;
after Phase 5 the whole public API surface is covered end to end.
