# Frontend Refactor V1

## Status and authority

This is the governing implementation plan for the owner-requested
`feat/frontend-refactor-v1` campaign. It supplements the accepted frontend
architecture already present on `main`; it does not weaken security, privacy,
accessibility, compatibility, or recovery contracts from the prior frontend
plans.

The campaign is source-first. The owner explicitly requested that tests,
builds, and broad validation be deferred until the implementation slices are
complete. Deferred validation is not acceptance.

## Goals

1. Correct concrete frontend interaction, initialization, resource-tracking,
   request-concurrency, and lifecycle defects.
2. Preserve dependency inversion while removing hidden reactive globals and
   direct browser-storage/ID access from domain stores.
3. Split the Graph and Semantic/System hotspots into cohesive typed modules
   without changing public routes or backend contracts.
4. Replace concentrated `any` boundaries with owned view/domain types, reduce
   broad store/prop surfaces, and consolidate repeated detail/async/form UI.
5. Add and run focused interaction, state, type, and integration validation in
   one later qualification slice.

## Architecture constraints

- Keep Browser and Tauri composition roots as the only concrete carrier
  owners; screens and stores must not call raw transport APIs.
- Keep one `RootStore` runtime graph, project-generation cancellation,
  `ResourceSlot`, and `OperationLedger` semantics.
- Browser session transitions remain serialized, but ordinary same-project RPC
  requests may run concurrently after a stable session snapshot is acquired.
- Diagnostics observe failures; they must not be the event bus that makes
  application state reactive.
- Domain stores consume injected ports for preferences, clocks, IDs,
  scheduling, and lifecycle.
- Graph visual and structured views consume one typed display model and shared
  selection/actions.
- Refactors preserve public routes, API operations, saved preference keys, and
  visible user workflows.

## Work slices

### MEM-FR00 — campaign baseline

- Bind the requested branch, adopted frontend evidence, exact starting tree,
  corrected package scopes, and implementation-first validation policy.

### MEM-FR01 — correctness, concurrency, and DI foundations

- Fix nested action keyboard behavior in the shared table and make its row
  contract generic.
- Allow concurrent same-project browser RPCs without racing session rotation.
- Make initialization honor the latest requested route/project.
- Replace manual resource omission hazards with declarative store resource
  registration.
- Make browser session state explicitly observable and injected; remove the
  diagnostics-driven re-render dependency.
- Inject preferences and IDs into domain stores and dispose application-scope
  cancellation authorities.

### MEM-FR02 — typed Graph boundary

- Extract graph display normalization, screen controller/selectors, and D3
  renderer responsibilities into cohesive modules.
- Replace `any` graph contracts with exact display node/edge/model types.
- Group graph selection and action props while preserving accessible and visual
  view synchronization.

### MEM-FR03 — semantic/system decomposition and UI consolidation

- Extract semantic polling/reconciliation from semantic commands/resources.
- Split SystemStore responsibilities into health/MCP, backup/trash, and import
  collaborators behind a compatible facade.
- Replace remaining document/session/search `any` contracts with owned types.
- Remove Search's broad RootStore presenter dependency and reuse canonical
  record-detail components where practical.
- Adopt shared async/form primitives where they remove duplicated state logic
  without changing UX.

### MEM-FR04 — qualification

- Add focused rendered interaction coverage for shared table actions,
  Search/Documents editor parity, project-route initialization, resource
  aggregation, browser concurrency, and graph/semantic lifecycles.
- Run affected typechecks and focused suites, followed by one CI-equivalent
  validation pass.

## Rollback

Each source slice is independently attributable. Roll back one slice at a time
while retaining existing public contracts, accessibility fallbacks, security
boundaries, and the last accepted state machinery.
