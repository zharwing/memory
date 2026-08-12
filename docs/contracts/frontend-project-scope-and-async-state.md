# Frontend project scope and asynchronous state contract

Status: governed by `MEM-FE02`.

This contract defines how the desktop frontend prevents data, errors, loading
flags, and scheduled work from one project appearing in another project. It is
the application rule for every project-scoped read and effect, independent of
the browser or Tauri carrier.

## One scope authority

`ProjectScopeCoordinator` is the only authority for the accepted project. A
captured `ScopeToken` contains a project ID, a monotonically increasing
generation, and an abort signal. Project identity alone is insufficient: in an
A -> B -> A sequence, callbacks from the first A must not commit into the
second A.

A project change is synchronous and ordered:

1. abort the previous generation;
2. increment the generation;
3. install the new immutable token;
4. notify reset listeners before returning;
5. start reads for the new token.

Selecting the same accepted project reuses its token. Clearing or disposing
the scope aborts the active generation and removes all project-scoped state.

## Request rule

Every project-scoped request must capture exactly one token before dispatch,
pass that token's signal to the typed operation client, and use the same token
for every later commit decision. A store must not reread a mutable project ID
after an `await`.

A resource result may commit only when both are true:

- its request ID is still the resource slot's active request; and
- its scope token is still the coordinator's current, non-aborted token.

This rejects obsolete success, failure, cancellation, and `finally` work. The
request ID also prevents an older refresh from defeating a newer refresh in
the same project generation.

## Resource state

Each resource has one authoritative `ResourceState<T>`:

- `idle`: no accepted request or data;
- `loading`: the first request is pending;
- `refreshing`: a request is pending while same-scope accepted data remains;
- `success`: accepted non-empty or partial data;
- `empty`: accepted, complete, empty data;
- `failure`: a typed public error, optionally with same-scope last-success
  data.

`lastSuccess` records the same-scope data, completeness, and receipt time. It
is cleared synchronously on a project change. Private exception text is never
copied into state; unknown failures become the owned internal public error.

Rendering rules follow directly from state:

- `idle` or `loading` is never rendered as empty;
- an empty partial result is `success`, not `empty`;
- a failure can retain only data from the same scope token;
- a project transition hides the old generation before new work starts.

## Completeness

Completeness is either `complete` or `partial`. Partial data can optionally
carry a server cursor or total, but the client must never invent either.

The current session API has a limit but no cursor or total. The frontend uses
bounded replacement limits of 20, 50, 100, and 200:

- fewer rows than the requested limit means complete;
- exactly the requested limit means partial;
- exactly 200 rows remains partial because the server can have more rows;
- `loadAll()` means request the bounded maximum, not prove completeness.

## Effects and concurrent operations

Effects use an `OperationLedger`, keyed by unique operation identity and a
semantic UI key. One effect completing must not clear a concurrent peer's busy
state. Terminal states are `succeeded`, `refused`, `failed`, or
`reconciling`; validation, authorization, and conflict errors are refusals.
An `after-reconcile` error is not a normal retry signal. `fail()` records that
outcome as a terminal `reconciling` state with its typed public error and does
not leave the operation busy. A caller that actually starts authoritative
reconciliation uses `reconcile()` first and must later settle or abandon that
active attempt.

Scoped attempts carry the captured token. Once that token is aborted, a late
success or failure cannot settle the ledger or trigger a follow-up refresh.

## Semantic polling

Semantic polling is completion-scheduled, never interval-driven:

- at most one timer and one request may exist;
- the next timer is created only after the current request settles;
- normal active polling waits 2 seconds after completion;
- failures back off deterministically through 2, 4, 8, 16, then 30 seconds;
- terminal status stops polling after authoritative reconciliation;
- blur or hidden state cancels the pending timer;
- focus or resume schedules one immediate poll;
- a project change or disposal stops the timer, and obsolete completions cannot
  commit or schedule more work.

## Required evidence

The regression suite must cover A -> B -> C and A -> B -> A, including old
success, old failure, old `finally`, same-generation overlapping refreshes,
concurrent effects, selected-project deletion, empty-versus-partial session
boundaries, and polling focus/backoff/disposal. Tests use synthetic project IDs
and adversarial deferred promises; real private projects are not test data.
