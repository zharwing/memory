# Frontend release evidence schema

`zharwing.frontend-release-evidence.v2` is the immutable local candidate
manifest produced by `scripts/generate-frontend-evidence.mjs`.

## Bound candidate fields

| Field | Meaning |
| --- | --- |
| `source` | Exact Git commit, branch or detached state, and dirty flag |
| `lockfiles` | SHA-256 of `pnpm-lock.yaml` and the Tauri `Cargo.lock` when present |
| `profile` | Exact `personal-preview` or `hardened-local` build profile |
| `environment` | Platform, architecture, Node version, and OS release |
| `invocation` | Exact evidence-generator command and arguments |
| `artifact` | Root, web inventory digest, complete release-set checksum digest, file count, and total emitted bytes |
| `commands` | Exact required command, exit status, duration, and bounded stdout digest |
| `optionalCommands` | Requested browser or Tauri qualification with pass/deferred truth |
| `supplyChain` | Dependency closure, SBOM, and checksum paths plus SHA-256 |
| `performance` | Validated controlled observations or an explicit deferral |
| `unexpectedSkips` | Closed list; required source candidate generation requires it empty |
| `deferredPlatformValidation` | Named qualification gate and bounded reason |

No field accepts exception text, command stderr, environment dumps, source or
memory paths, arbitrary metadata, credential values, provider responses, or
private project data. Command stdout is reduced to a SHA-256 before the
manifest crosses the release boundary.

## Gate semantics

- A required gate returns zero or candidate generation stops without a
  manifest.
- A requested optional gate may defer only through its documented unavailable
  result. Any other non-zero result fails the candidate.
- An unrequested platform gate is named under
  `deferredPlatformValidation`; it is not placed in `unexpectedSkips`.
- SBOM and checksum bytes are rehashed when bound into the manifest.
- The SBOM artifact digest must equal the final frontend inventory digest.
- A manifest for one artifact/profile/commit cannot overwrite different facts.

Evidence generation proves local candidate facts. It does not authorize or
perform signing, upload, deployment, promotion, rollback, or release.
