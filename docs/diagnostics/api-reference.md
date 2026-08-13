# MEM-FEV2-05 API Reference

## Core exports

From `@zharwing/memory-core`:

- `PUBLIC_ERROR_REGISTRY`
- `PublicError`
- `PublicErrorCode`
- `PublicMessageId`
- `PublicErrorCategory`
- `PublicErrorSeverity`
- `PublicRetry`
- `PublicRecoveryAction`
- `PublicErrorParameters`
- `PublicErrorOptions`
- `publicErrorSchema`
- `createPublicError(code, options)`
- `isPublicError(value)`
- `RpcFailure`, whose `error` is exactly `PublicError`
- `rpcError(id, publicError)`, whose type admits only `PublicError` and whose
  runtime fallback converts any cast/bypassed invalid value to canonical
  `internal`

## Desktop recovery exports

From `apps/desktop/src/app/recovery/index.ts`:

- `publicMessageCopy(messageId)`
- `recoveryActionCopy(action)`
- `DiagnosticReportAction`
- `RecoveryPanel`
- `RecoveryBoundary`
- `RootRecoveryBoundary`
- `RouteRecoveryBoundary`
- `ResourceRecovery`
- `OperationRecovery`
- `FormErrorSummary`

## Diagnostic exports

From `apps/desktop/src/platform/diagnostics/index.ts`:

- `LocalDiagnosticJournal`
- `SafeDiagnosticInput`
- `ClosedDiagnosticInput`
- `SafeDiagnosticEvent`
- `SanitizedDiagnosticReport`
- `DiagnosticSurface`
- `DiagnosticEventName`
- `installProductionConsoleSentinel(enabled, journal)`

The application runtime owns one `LocalDiagnosticJournal` and injects it into
recovery and console-sentinel surfaces. There is no process-global diagnostic
journal or second in-memory sink.

## Store exports

`RootStore.recoveryState` returns `AppRecoveryState` and is the shell-level
truth authority. `RootStore.publicError` is a compatibility-safe projection of
the highest-priority current error. `RootStore.recover()` re-reads application
and selected-project state without retrying a mutation.
