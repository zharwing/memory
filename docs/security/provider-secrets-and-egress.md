# Provider secrets and egress

## Owned secret lifecycle

Provider credentials are write-only from the frontend. The browser or webview
may submit a new value only to `set` or `rotate`; it can read only a bounded
status containing presence, revision, and update time. Plaintext is never
returned, reflected into provider-check output, stored in a project, written
to diagnostics, or retained in form state after submission.

The daemon stores an AES-GCM envelope under daemon-controlled state outside
project content. The state path and all existing components must be regular,
non-link files/directories. `set` refuses an existing credential. `rotate`
requires the expected current revision. `clear` removes the envelope. This
prevents blind overwrite and makes concurrent operator actions explicit.

Project provider kind, endpoint, and model are server-owned configuration.
Analysis, provider checks, and session summaries reject caller credential,
endpoint, model, or provider substitutions and read the current secret only at
the daemon dispatch boundary.

## Egress authorization

Every provider request is restricted to HTTP(S), rejects URL credentials and
fragments, resolves the destination before dispatch, denies metadata and
private address ranges other than explicit loopback providers, and connects to
the exact authorized IP while preserving the original Host and TLS server
name. Mixed public/private DNS answers fail closed.

Redirects are never followed. A redirect target is parsed and independently
authorized only to produce a safe refusal; credentials and payload bytes are
not sent to it. Provider responses are bounded to 4 MiB and decoded as strict
UTF-8 before schema validation. Callers select only the registered project
provider; `remoteProvidersEnabled` is required for non-loopback destinations.

Provider-controlled response fields pass through a closed daemon adapter.
Unknown properties, raw provider prose, URL credentials/query/fragment,
unbounded model lists, and secret-shaped strings never reach public output.

## Failure semantics

Secret-store corruption, revision mismatch, link/path violations, denied
addresses, DNS ambiguity, redirect, timeout, oversized responses, and malformed
provider output return owned public errors. They never trigger a retry against
a different destination. A provider effect whose outcome cannot be proved is
reported as outcome unknown and reconciled before any retry.

## Verification obligations

- Status/set/rotate/clear never reveal plaintext, including logs and evidence.
- Concurrent rotation requires the exact revision and stale rotation fails.
- Metadata, RFC1918/link-local, mapped-private IPv6, mixed DNS, redirect, URL
  credentials, query-secret, and oversized-response vectors fail closed.
- The exact configured loopback provider remains usable.
- Browser, desktop, admin, and provider audiences receive only the closed
  provider-check result.
