# Testing Plan

Zharwing Memory prioritizes the failures that would hurt a local developer
most: leaking excluded information into AI context, corrupting Markdown
memory, breaking the daemon contract, or making the desktop interface unable
to reach the supported workflows.

## Current Automated Coverage

The deterministic suite currently covers:

- privacy exclusions, secret blocking, and redaction;
- Markdown session and document round-trips;
- context-bundle privacy integration;
- daemon project, session, document, context, and inbox lifecycles;
- HTTP authentication, request-body limits, origins, hosts, and RPC responses;
- RPC parameter presence and MCP schema validation;
- the exact eleven-tool MCP surface and installation contracts;
- graph and semantic-graph policy;
- a fake OpenAI-compatible semantic-graph provider flow; and
- desktop route contracts plus a real Edge app-shell smoke.

The root runner discovers tests from `src/**/*.test.ts` and maps them to their
compiled output. It fails when no tests are found, compiled tests are missing,
or stale compiled tests no longer have a source counterpart. This prevents a
fresh checkout from reporting a false green result with zero tests.

## Commands

Run the deterministic repository suite:

```text
corepack pnpm test
```

Run the repository-wide coverage thresholds explicitly:

```text
corepack pnpm test:coverage
```

Run the desktop browser smoke:

```text
corepack pnpm test:desktop-browser
```

Run the opt-in live-provider check only when a provider has been configured:

```text
corepack pnpm test:live-provider
```

The default GitHub Actions workflow runs the deterministic suite, build,
desktop browser smoke on Windows, packaged desktop build, source-artifact
checks, and Rust tests. It does not currently run `test:coverage` or the live
MCP doctor; record those separately when they are release requirements.

## Remaining Gaps

The preview does not claim complete end-to-end coverage. Important remaining
work includes:

- broader import commit and conflict-strategy scenarios;
- complete backup and Trash restore/purge lifecycles;
- broader search and graph boundary cases;
- more desktop pure-logic tests and full native desktop workflows;
- installer-level smoke testing; and
- opt-in qualification against every provider configuration the project wants
  to support.

Normal project memory, sessions, search, deterministic graph, context, backup,
and Trash workflows do not require an AI provider. Provider tests cover only
the optional model-backed features.

## Test Design Rules

- Use disposable temporary directories rather than private Memory stores.
- Exercise public APIs and observable files instead of internal call order.
- Keep fixtures deterministic and free of credentials or personal paths.
- Treat skipped and unavailable checks as skipped, never as passed.
- Add a focused regression test when a production defect is fixed.

For provider-specific setup and manual scenarios, see
[Testing With AI Providers](AI_TESTING.md).
