# Testing With AI Providers

Zharwing Memory has real OpenAI-compatible provider integration for model-backed
semantic graph analysis. That is the path that builds AI-suggested document
relationships from project docs, routes reviewable edges through Memory Inbox,
and stores accepted relationships as semantic graph metadata.

Default validation still does not start or require an AI model. Typecheck,
build, unit tests, daemon startup, CLI commands, MCP startup, context preview,
and the saved Graph context map should work without LM Studio, Ollama,
llama.cpp, or any remote provider.

Use an AI provider when manually exercising the semantic graph relationship
builder or checking provider connectivity. The provider is a real runtime
dependency for those model-backed workflows, just not a dependency of the
default automated test suite.

## Should LM Studio Be Running?

Start LM Studio only when you want to test model-backed behavior:

- Assistant screen **Test provider**.
- automatic or manual session TLDR generation.
- `memory.check_semantic_graph_provider`.
- Semantic graph `dry-run`, `review`, or `auto` analysis.

Do not start LM Studio for:

- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- daemon health checks
- project/doc/context workflows
- Graph context map
- semantic graph preview

If you use LM Studio, load a model that can follow JSON instructions, start its
local OpenAI-compatible server, and copy the base URL shown by LM Studio. The
examples below use placeholders; replace them with the endpoint and model name
shown by your provider.

```text
Endpoint: <local-openai-compatible-endpoint>
Model: <local-model-name>
```

Local endpoints are preferred. Remote semantic graph providers are disabled by
default and should be enabled only after the user explicitly accepts sending
eligible project documents to that provider.

## Baseline Non-AI Validation

Run these from the app source root:

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:desktop
```

The build step runs Vite and uses native Rollup/esbuild optional packages. If a
checkout is shared between Windows and WSL, install dependencies in the same
operating system that will run the command. A missing or wrong-platform native
optional package means the dependencies need to be reinstalled for that
environment.

For a fast local loop after dependencies are already installed:

```bash
pnpm typecheck
pnpm test
```

After `corepack pnpm build`, run the real browser smoke on a machine with Edge
or Chrome:

```text
corepack pnpm test:desktop-browser
```

The smoke launches the built Vite preview, opens the Projects route in a
headless browser, and verifies that the React shell and Zharwing branding
render. Set `ZHARWING_MEMORY_BROWSER_PATH` when the browser is not installed in
a standard location.

The build also enforces a 450 KB raw startup-entry budget and a 1.2 MB raw
maximum lazy-chunk budget. Override these only for deliberate investigation
with `ZHARWING_MEMORY_ENTRY_BUDGET_BYTES` or
`ZHARWING_MEMORY_CHUNK_BUDGET_BYTES`; CI uses the defaults.

## Start Zharwing Memory

Copy `.env.example` to `.env`, then set a private memory root and local auth
token. Do not use a committed or shared source directory as the memory root.

Start the daemon:

```bash
corepack pnpm dev:daemon
```

In another terminal, start the browser UI:

```bash
corepack pnpm dev:web
```

Or start the native desktop shell:

```bash
corepack pnpm dev:desktop
```

Check the daemon:

```bash
curl -s http://127.0.0.1:37841/health
```

## Create A Disposable Test Project

Use a throwaway project and small Markdown fixtures. Keep the memory root
private and disposable while testing.

```bash
corepack pnpm dev:cli init --name "AI Provider Smoke" --project-only --no-pointer
```

Use the returned project id in later commands as `<project-id>`.

Create or import a few small docs before semantic analysis. For example:

```bash
corepack pnpm dev:cli import <markdown-file> --project <project-id> --title "Overview"
corepack pnpm dev:cli import <another-markdown-file> --project <project-id> --title "Architecture"
```

Then confirm the non-AI graph works:

```bash
corepack pnpm dev:cli graph --project <project-id>
```

## Provider Check

The provider check asks for a tiny JSON response. A reachable server is not
enough; the provider must return parseable JSON.

From the UI:

1. Open **Settings -> Assistant**.
2. Enable the assistant provider.
3. Choose **OpenAI-compatible**.
4. Enter the local endpoint and model name.
5. Save provider.
6. Click **Test provider**.

For LM Studio and other local OpenAI-compatible servers, the UI uses plain text
JSON prompting by default instead of forcing OpenAI `response_format`.

From JSON-RPC:

```bash
curl -s http://127.0.0.1:37841/rpc \
  -H "authorization: Bearer <local-ai-memory-token>" \
  -H "content-type: application/json" \
  --data '{
    "id": 1,
    "method": "memory.check_semantic_graph_provider",
    "params": {
      "projectId": "<project-id>",
      "endpoint": "<local-openai-compatible-endpoint>",
      "model": "<local-model-name>",
      "timeoutMs": 60000,
      "maxOutputTokens": 128
    }
  }'
```

Pass criteria:

- `ok` is `true`.
- The response includes the expected endpoint and model.
- Latency is reasonable for the selected local model.

The repository also includes an opt-in automated live-provider smoke path. It
is intentionally excluded from default CI because it requires a configured
provider process and, for remote providers, credentials:

```text
ZHARWING_MEMORY_LIVE_PROVIDER_ENDPOINT=<provider-endpoint>
ZHARWING_MEMORY_LIVE_PROVIDER_MODEL=<model-name>
ZHARWING_MEMORY_LIVE_PROVIDER_KIND=<lm-studio|ollama|llama-cpp|openai|anthropic|custom-openai-compatible>
corepack pnpm test:live-provider
```

Set `ZHARWING_MEMORY_LIVE_PROVIDER_API_KEY` only in the local process
environment when required. The smoke script never prints it.

If the provider rejects OpenAI `response_format`, add `--no-json-mode` to the
CLI command or call the authenticated daemon RPC method with `jsonMode: false`.

## Semantic Graph Smoke Test

The normal UI path is:

1. Open **Graph**.
2. Open **Details**.
3. In **AI relationship review**, choose the scope.
4. Click **Run review**.
5. Inspect the proposal in Inbox before accepting edges.
6. Return to Graph to see accepted relationships.

Provider overrides, dry-run mode, candidate limits, timeouts, output-token
limits, and provider JSON mode are under **Advanced**.

## Session TLDR Smoke Test

Session TLDR generation is separate from semantic graph relationships. It keeps
sessions searchable while graph visibility remains controlled by the session's
**Include in graph** flag.

From the UI:

1. Configure a local assistant provider in **Settings -> Assistant**.
2. Start or select a session.
3. Close the session from **Current Work**.
4. Open **Work -> Sessions**.
5. Confirm the selected session has a TLDR source, generated timestamp, topics,
   and summary text.
6. Confirm **Include in graph** is off by default, then enable it and verify the
   session appears in Graph. Disable it again and verify its session-derived
   node and relationships disappear without removing it from Session History or
   search.

Manual and bulk paths:

```bash
corepack pnpm dev:cli assistant generate-session-summary \
  --project <project-id> \
  --session <session-id>

corepack pnpm dev:cli assistant generate-session-summaries \
  --project <project-id>

corepack pnpm dev:cli assistant generate-session-summaries \
  --project <project-id> \
  --all
```

The UI path uses the provider saved in project settings. The CLI path also
accepts advanced overrides such as `--endpoint`, `--model`, and `--no-json-mode`
when testing provider compatibility directly.

Pass criteria:

- The session Markdown frontmatter includes `summary_generated_at`.
- Search finds the session by generated summary text or generated topics.
- The main Graph excludes a session while **Include in graph** is off and shows
  it, together with its derived relationships, while the flag is on.
- If no safe local provider is configured, the session still gets a
  deterministic TLDR instead of failing closeout.

For CLI/RPC smoke tests, first run semantic graph preview. Preview builds the
scoped document and candidate plan without calling a model.

```bash
curl -s http://127.0.0.1:37841/rpc \
  -H "authorization: Bearer <local-ai-memory-token>" \
  -H "content-type: application/json" \
  --data '{
    "id": 2,
    "method": "memory.preview_semantic_graph_analysis",
    "params": {
      "projectId": "<project-id>",
      "scope": { "kind": "all-docs" },
      "maxDocumentChars": 8000
    }
  }'
```

Then run a small model-backed dry run. Dry run calls the provider and writes run
metadata/caches, but it does not create accepted durable edges or Inbox
proposals.

```bash
corepack pnpm dev:cli semantic-graph analyze \
  --project <project-id> \
  --mode dry-run \
  --endpoint <local-openai-compatible-endpoint> \
  --model <local-model-name> \
  --no-json-mode \
  --max-docs 4 \
  --max-candidates 8 \
  --per-doc 4 \
  --timeout-ms 120000
```

Pass criteria:

- The run completes with status `completed`.
- At least one eligible document is analyzed when the test project has docs.
- Invalid JSON errors do not occur.
- Any proposed dry-run edges include a type, confidence, reason, and evidence.

After dry run passes, run review mode:

```bash
corepack pnpm dev:cli semantic-graph analyze \
  --project <project-id> \
  --mode review \
  --endpoint <local-openai-compatible-endpoint> \
  --model <local-model-name> \
  --no-json-mode \
  --max-docs 4 \
  --max-candidates 8 \
  --per-doc 4 \
  --timeout-ms 120000
```

Review mode should create Memory Inbox proposals instead of silently trusting
model output. Inspect proposals:

```bash
corepack pnpm dev:cli inbox --project <project-id>
corepack pnpm dev:cli semantic-graph runs --project <project-id>
corepack pnpm dev:cli semantic-graph edges --project <project-id>
```

Accept proposals from the UI only after checking the evidence.

Relationship quality pass criteria:

- The proposal is not dominated by file/topic metadata links when document,
  service, package, or code-area relationships are available.
- Duplicate inverse `related` pairs for the same two documents are absent.
- Each accepted edge has a sensible type, direction, reason, and evidence quote.
- Noisy pending proposals are rejected or left pending; they should not be used
  as proof that semantic graph quality is good.

## MCP Smoke Test

When validating an AI client integration, start or reuse the daemon, install the
target client config, and check setup:

```text
zharwing-memory mcp install auto
zharwing-memory mcp doctor
```

Use `codex`, `claude-code`, or `claude-desktop` instead of `auto` to target one
client. Use `--transport stdio` when the client needs a process-launched
adapter. Manual templates remain available in `templates/mcp/`, and the full
setup guide is [MCP Setup](MCP_SETUP.md).

Then have the client call these tools:

```text
memory.get_startup_state
memory.start_session
memory.search
memory.get_session_detail
memory.preview_context_bundle
memory.save_checkpoint
memory.close_session
```

Run semantic graph provider checks and analysis through the UI or CLI. Those
administrative operations are intentionally outside the focused MCP surface;
use preview and dry-run modes before review or auto mode.

## Troubleshooting

- `ECONNREFUSED` from Zharwing Memory: start `corepack pnpm dev:daemon`.
- `401 Unauthorized`: the bearer token does not match `.env`, or the client did
  not inherit `ZHARWING_MEMORY_AUTH_TOKEN`.
- Provider timeout: lower `--max-docs`, `--max-candidates`, and `--per-doc`, or
  increase `--timeout-ms`.
- Invalid JSON: choose a model with stronger instruction following or lower the
  scope size. If the provider rejects OpenAI JSON mode, add `--no-json-mode` or
  pass `jsonMode: false` through the administrative RPC.
- Remote endpoint rejected: local endpoints are allowed by default; remote
  endpoints require `remoteProvidersEnabled`.
- Vite or build reports a missing or wrong-platform Rollup/esbuild optional
  package: reinstall dependencies in the operating system that is running the
  command.
