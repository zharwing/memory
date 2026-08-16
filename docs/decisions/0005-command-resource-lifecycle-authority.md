# ADR 0005: Command, Resource, And Lifecycle Authority

Status: accepted  
Owner: Zharwing Memory maintainers  
Decision date: 2026-08-14  
Supersedes: ad hoc per-store invalidation and reset policy  
Superseded by: none

## Context

Operation invalidation metadata already existed in the core registry, but UI
stores separately encoded refresh fan-out, retry identity, and project reset
lists. Those parallel policies could drift, duplicate requests, erase an
unknown mutation outcome, or allow stale A-to-B-to-A results to commit.

## Decision

The core operation registry owns invalidation tags. `OperationCoordinator` owns
one command identity through dispatch, outcome reconciliation, authoritative
reobservation, and body-free peer notification. `ResourceRegistry` maps the
closed resource vocabulary to loaders once. `ProjectScopeCoordinator` owns
generation and cancellation, while `ProjectLifecycleRegistry` is the sole
ordered project-reset/disposal subscriber. Stores retain feature state and
commands but do not invent invalidation policy.

Unknown mutation outcomes retain the original operation identity. Automatic
redispatch is forbidden; a descriptor may settle only from definitive readback,
otherwise the UI keeps a manual reconciliation state. Destructive prepare/commit
handles retain the same daemon capability across that uncertainty.

## Alternatives Considered

- Keep refresh callbacks in every store: rejected as a second invalidation
  registry.
- Adopt a general client cache library: deferred because the existing bounded
  `ResourceSlot` model already owns request identity, completeness, and stale
  data; policy ownership was the missing piece.
- Optimistically update every mutation: rejected until revisions and definitive
  readback exist for each command.
- Persist the operation ledger as an offline outbox: rejected because the
  product does not promise reload-surviving or offline command delivery.

## Consequences

- Browser and native compositions follow the same mutation/reobservation order.
- Peer messages contain resource tags and scope, never entity bodies.
- Project changes cancel old work and reset each participant exactly once.
- Command descriptors and resource owners are explicit composition code that
  must remain exhaustive as operations are added.

## Migration And Compatibility

Public operation names, payloads, routes, and store-facing methods remain
compatible. Existing store getters remain temporary projections while screens
adopt total read models. Browser storage keys and graph position format 3 remain
unchanged.

## Revisit When

Revisit if measured workloads require a shared server-state cache, offline
command delivery becomes a product requirement, or operation revisions provide
enough evidence for bounded optimistic updates.
