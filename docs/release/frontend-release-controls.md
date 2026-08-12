# Frontend candidate controls

## Candidate, not release

`pnpm release:frontend:candidate` creates one local candidate and its evidence.
The evidence generator runs the typed workspace build, Vite production build,
bundle/source checks, an isolated synthetic-canary secretless build, and
SBOM/checksum generation in a fixed order. A required failure stops before an
evidence manifest is written. The command does not commit, sign, upload,
publish, deploy, promote, or alter an external environment. Promotion is a
separate owner-controlled workflow.

The candidate is identified by source commit, branch, dirty-state flag,
`pnpm-lock.yaml` SHA-256, build profile, Node/OS architecture, exact generating
command, complete artifact inventory digest, and required-check list. Evidence
from a different artifact digest cannot satisfy the candidate.

Required local gates are:

1. typed production build;
2. startup/chunk/total JS/CSS/file-count budgets;
3. no source maps, test fixtures, synthetic privacy canaries, Node-only imports,
   or non-browser credential transports in emitted bytes;
4. no generated compiler artifacts under authored `src` trees;
5. no credential names or synthetic secret canaries in emitted bytes;
6. lockfile-derived SBOM and checksums;
7. evidence manifest with an empty unexpected-skip list.

The secretless lane builds again into an OS temporary directory with synthetic
values under administrator, agent, desktop, legacy Vite, provider, and JWT
credential names. The child receives a small process-launch allowlist instead
of the caller's arbitrary environment. Both the ordinary candidate and the
isolated canary build are scanned. No real credential value is read to prove
the property.

Outputs are immutable under:

```text
EXECUTION/evidence/frontend-v2/MEM-FEV2-10/candidates/<artifact-sha256>/
```

The directory contains the evidence manifest, a CycloneDX document derived
from the pnpm and Cargo lockfiles, and SHA-256 entries for every emitted web
file plus explicitly supplied packaged artifacts. Existing output is reused
only when its bytes are identical; a conflicting write fails closed.

Post-deploy or packaged smoke checks cannot replace a missing or failed
pre-promotion gate. The exact candidate bytes must be promoted without rebuild
when the release environment supports artifact promotion.

## Deferred qualification

Tauri packaging, signing, physical WebView/device testing, browser automation,
screen-reader matrices, and external audit tooling are recorded as
`deferred_platform_validation` when their approved environment is absent. They
are not silently skipped or called passed. Local source implementation may be
complete while release/device qualification remains incomplete.

Use `--browser-smoke` only when the supported local browser is available. Use
`--tauri-sidecar <repository-candidate-path>` only in the pinned Rust/Tauri
qualification environment. A requested optional gate that actually fails is a
candidate failure, not a deferral. Controlled performance observations may be
bound with `--performance <bounded-evidence-input.json>` using the schema in
[Frontend evidence schema](frontend-evidence-schema.md).

## Rollback

Rollback selects the last independently attested artifact and verifies its
digest before promotion. It never rebuilds from an old source checkout and
never weakens CSP, capabilities, secret handling, privacy projection, or
destructive confirmation to restore service.
Follow the [Frontend rollback runbook](frontend-rollback.md); rollback
rehearsal remains separate release-platform evidence.
