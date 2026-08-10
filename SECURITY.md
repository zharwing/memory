# Security Policy

## Supported Versions

Only the latest release and the current `main` branch receive security fixes.

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities.

Report them privately by email to `sviatoslavbarbutsa@gmail.com`. You should
receive a response within a few days. Please include reproduction steps and
the affected component (daemon, CLI, desktop, MCP server).

## Threat Model Notes

- The daemon binds to `127.0.0.1` only and requires a bearer token
  (`ZHARWING_MEMORY_AUTH_TOKEN`); it is not designed to be exposed to a
  network. Reports that assume a remotely reachable daemon should state why
  the exposure is realistic.
- Markdown files in the store are the source of truth. Anything that lets an
  agent or MCP client read or write outside the configured store root, bypass
  the privacy/redaction gates, or exfiltrate store content through tool
  responses is in scope and considered high severity.
