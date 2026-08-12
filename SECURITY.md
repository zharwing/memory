# Security Policy

## Supported Versions

Only the latest release and the current `main` branch receive security fixes.

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities.

Report them privately by email to `sviatoslavbarbutsa@gmail.com`. You should
receive a response within a few days. Please include reproduction steps and
the affected component (daemon, CLI, desktop, MCP server).

## Threat Model Notes

- The daemon binds to exact loopback by default and is not designed for network
  exposure. Browser cookie/CSRF sessions, native desktop authority,
  project-bound agent credentials, and the compatibility administrator bearer
  are distinct and registry-limited. Reports that assume a remotely reachable
  daemon or cross-audience credential reuse should state why that exposure or
  confusion is realistic.
- Browser JavaScript must never receive a bearer. The trusted-launcher flow
  exchanges a one-shot, Origin/Host-bound code for a short-lived HttpOnly
  cookie and memory-only CSRF value. The credential-free browser preview exists
  only for explicitly selected `personal-preview + authMode=none` on loopback.
- Markdown files in the store are the source of truth. Anything that lets an
  agent or MCP client read or write outside the configured store root, bypass
  the privacy/redaction gates, or exfiltrate store content through tool
  responses is in scope and considered high severity.
