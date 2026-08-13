# Safe Errors, Recovery, and Local Diagnostics

This document defines the MEM-FEV2-05 implementation contract. It is normative
for error presentation and diagnostic handling in the desktop application.

## Trust boundary

Exceptions, HTTP status text, provider payloads, parse errors, paths, project
content, and dependency console arguments are untrusted. None of them may be:

- rendered as user-facing copy;
- serialized into an RPC failure;
- retained in the local diagnostic journal;
- included in a downloaded diagnostic report; or
- forwarded to a production browser console.

All carriers use `PublicError` from
`packages/core/src/contracts/public-errors.ts`. `RpcFailure` contains that
canonical object and nothing else. The wire error has no message, stack, cause,
path, payload, or arbitrary metadata property. The strict decoder rejects
unknown properties and rejects a nominal error whose redundant fields do not
match its registered code.

## Public error algebra

Each registered code owns these values:

- stable `messageId`;
- category;
- severity;
- retry policy;
- ordered recovery actions;
- optional bounded safe parameters;
- optional bounded field-to-message-ID map; and
- optional opaque diagnostic ID.

The only public parameter currently accepted is `retryAfterSeconds`, bounded
from zero through one day. Field identifiers and diagnostic IDs use restricted
owned identifier grammars and length limits. Unsafe optional values are
dropped by `createPublicError`; the strict decoder rejects them on input.

The desktop selects English copy only through `publicMessageCopy(messageId)`.
No exception message is interpolated. Recovery buttons are selected only from
the canonical `recoveryActions` list.

## Recovery layers

The application has five distinct recovery layers:

1. `RootRecoveryBoundary` catches render failures that would otherwise remove
   the application. Startup composition failures render a safe root panel.
2. `RouteRecoveryBoundary` isolates a failed lazy screen from the shell and
   unaffected navigation. A route change clears the failed boundary.
3. `ResourceRecovery` preserves the difference between loading, refreshing,
   partial, stale, failed, complete-empty, and successful observations. Empty
   content is rendered only for the explicit complete `empty` state.
4. `FormErrorSummary` announces a public form error and provides owned links
   back to affected fields without rendering server validation text.
5. `OperationRecovery` distinguishes submission, refusal, failure, success,
   and uncertain/reconciling outcomes. An uncertain mutation is reconciled by
   re-reading authoritative state; it is not blindly retried.

`RecoveryPanel` focuses its heading when it replaces failed content and exposes
keyboard-operable recovery actions. A React boundary remembers the last
focused element and restores it after a successful in-place reset when that
element still exists.

## Application truth states

`RootStore.recoveryState` is the shell authority for cross-cutting truth:

- `locked`: browser authority is absent, expired, rotating, rebound, revoked,
  unauthorized, or forbidden;
- `reconciling`: a mutation has an after-reconcile public error;
- `offline`: a current transport read failed; a stale count states whether any
  prior accepted observations remain visible;
- `stale`: failed resources are showing prior accepted snapshots;
- `failed`: another safe public failure needs attention; or
- `ready`: none of the preceding facts is present.

The status pill and recovery notice use the same value. A stale snapshot is
explicitly labeled and a partial snapshot remains non-authoritative. Locked or
offline state never appears as ready. Route controls are inert while authority
is locked or a mutation outcome is being reconciled, while shell navigation and
the recovery action remain available. `RootStore.recover()` re-reads health,
application lists, and current project resources; it does not repeat the effect
that produced an uncertain outcome. Only after those reads succeed and no
effect is concurrently submitting does it clear the reconciled terminal state.

## Diagnostic journal

`LocalDiagnosticJournal` is memory-only. It has no network, analytics,
telemetry, storage, or automatic export behavior. It accepts a closed event
shape and immediately reduces an unknown error to a public classification.
The original value is discarded.

The journal retains at most 200 events. Events contain only sequence, elapsed
time, event/surface enums, public error classifications, recovery enums,
session status, and console level. A report is capped at 64 KiB by dropping the
oldest events and setting `truncated: true`.

`DiagnosticReportAction` is the only export path. It runs only after an
explicit button activation and downloads a JSON report with no environment,
path, project, principal, credential, provider, or content fields. Clearing the
compatibility sink also clears the local journal.

## Production console sentinel

`installProductionConsoleSentinel(true, journal)` replaces `console.warn` and
`console.error` during the production browser lifetime. It records only that an
unexpected warning or error occurred and its level. It does not inspect,
stringify, retain, or forward the arguments. Disposal restores the original
console methods. No telemetry is emitted.

## Recovery matrix

| Public category or condition | User truth | Primary recovery |
| --- | --- | --- |
| Validation | Request refused; no effect assumed | Review owned field messages |
| Authorization | Locked or forbidden | Reload trusted session or return |
| Conflict | Data changed elsewhere | Refresh authoritative data |
| Read unavailable | Offline; stale data labeled if present | Retry the read |
| Read timeout | Current observation unavailable | Reconcile/read again |
| Mutation timeout/outcome unknown | Effect may have happened | Reconcile; never blind retry |
| Protocol | Response was not safely usable | Reload app |
| Compatibility | Client/service versions disagree | Restart compatible service, reload |
| Render crash | Only the affected boundary is replaced | Reset boundary or reload root |

## Extension rules

Adding a public error requires one registry entry, canonical owned copy, and a
recovery action. Adding a diagnostic field requires proving it is bounded,
closed, and incapable of carrying user/external text. Do not add a generic
`message`, `details`, `metadata`, `context`, `value`, or `data` slot. Do not
temporarily restore the legacy RPC error union for compatibility; an invalid
legacy envelope is a protocol failure.
