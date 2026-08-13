# Frontend Refactor V1 Baseline

- Branch: `feat/frontend-refactor-v1`
- Starting commit: `63feadb9c183010054895ebed00f010e8e1e4f66`
- Starting source: current `main`, before frontend-refactor source edits
- Scope: correctness and performance defects, dependency/lifecycle ownership,
  Graph and Semantic/System cohesion, concentrated frontend type safety, and
  repeated presenter/async/form behavior
- Validation policy: source implementation first by explicit owner direction;
  focused and CI-equivalent validation belongs to `MEM-FR04`

The baseline adopts the existing frontend architecture and historical evidence
without reclassifying earlier provisional package outcomes. It preserves the
current public routes, API contracts, security/privacy boundaries,
accessibility fallbacks, preference keys, and user workflows.
