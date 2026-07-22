# Contributing

## Runtime requirements

- Node `22.21.0` (pinned in `.node-version`) or Node 24 LTS. The engine range is
  `>=22.21.0 <23 || >=24.0.0 <25`; CI stays pinned to Node 22 for reproducibility.
- pnpm `9.0.0` via corepack (`packageManager` field). Run commands as
  `corepack pnpm <command>` so the pinned version is used.

## Commands

```text
corepack pnpm install                 # install dependencies
corepack pnpm check:source-artifacts  # fail if generated files sit under src/
corepack pnpm typecheck               # tsc -b across the workspace
corepack pnpm test                    # clean-compile + run all tests
corepack pnpm test:coverage           # same, with Node coverage thresholds
corepack pnpm test:desktop            # desktop routing and workflow contracts
corepack pnpm test:desktop-browser    # real headless Chrome/Edge route smoke after build
corepack pnpm test:live-provider      # opt-in check against a configured provider
corepack pnpm build                   # TypeScript build + desktop web build
corepack pnpm check:bundle-size       # enforce startup and lazy-chunk size budgets
corepack pnpm build:desktop           # packaged native desktop executable
```

`corepack pnpm test` owns test compilation: it cleans TypeScript output,
force-rebuilds, then runs `scripts/run-tests.mjs`. The runner discovers
`src/**/*.test.ts(x)` as the source of truth and fails when zero tests are
found, when an expected compiled test is missing, or when stale compiled
tests have no source counterpart. Do not bypass it with ad-hoc `node --test`
invocations for CI-relevant validation.

## Source and build-output policy

- `src` directories contain authored TypeScript/TSX and reviewed assets only.
- Compiler output (`.js`, `.d.ts`, `.map` and variants) is emitted only to
  ignored `dist` directories and is never committed or hand-edited.
- A `.js` import specifier inside TypeScript source does not imply a committed
  `.js` file; it resolves at build time.
- **Never invoke `tsc` with positional file arguments** such as
  `tsc packages/core/src/index.ts` — that bypasses project output settings and
  writes JavaScript next to the source. Use `corepack pnpm typecheck`,
  `corepack pnpm build`, or `corepack pnpm --filter <pkg> build`.
- Run `corepack pnpm check:source-artifacts` before committing. CI runs it
  before and after builds.
- A genuinely handwritten declaration file requires an exact-path allowlist
  entry in `scripts/lib/artifact-scan.mjs` with a rationale and owner; never
  allowlist an extension or directory wholesale.

## Windows and WSL

A checkout shared between Windows and WSL must install dependencies in the
same OS that runs Vite/Rollup/esbuild — optional native packages are
platform-specific. If the repo lives on the Windows filesystem, run installs,
typecheck, tests, and builds from Windows. Plain `node:test` suites work in
either OS, but do not mix `node_modules` between them.

## Tests

- Backend tests use `node:test` + `node:assert/strict`, live next to the code
  as `src/**/*.test.ts`, and run compiled from `dist`.
- The desktop workspace is `noEmit`. Pure routing and workflow contracts run
  through `test:desktop`; the built app shell runs through a real Chromium
  browser with `test:desktop-browser`.
- Filesystem tests must create their own temp roots under `os.tmpdir()` and
  clean up after themselves.
