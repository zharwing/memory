# Dependency closure and SBOM policy

The lockfile is the executable dependency closure. An exact version or digest
is reproducibility evidence, not approval by itself. Any closure delta requires
an owned reason and review of runtime packages, development tools, optional
packages, install scripts, CI actions, reusable workflows, Rust crates, Tauri
plugins, and packaged container/sidecar identities.

This campaign does not add or update dependencies. The SBOM generator reads
the existing pnpm snapshot closure and Cargo package closure without network
access. Its CycloneDX JSON is bound to both lockfile SHA-256 values and the
frontend artifact inventory digest. Workspace packages, resolved npm packages,
and locked Rust crates receive stable package references; registry-provided
Cargo checksums are preserved.

The generator also writes a deterministic SHA-256 manifest for every emitted
web file. Releasable native or sidecar files are added only through explicit
`--artifact <repository-candidate-path>` arguments and must be bounded regular
files inside the candidate tree. The packaged daemon sidecar is separately
supplied to the Tauri build, checked, hashed, copied only for that build, and
removed from the source tree afterward. The Tauri host refuses a release build
without it.

Owned waivers must identify the exact package/action/container, version or
digest, affected closure, reason, owner, expiry, replacement plan, and evidence.
Expired, unauthenticated, wildcard, or transitive-only waivers fail closed.

The SBOM, artifact inventory, checksums, audit output, license findings, and
waiver set belong to the same candidate evidence manifest. The local generator
does not claim that a static lockfile projection is a vulnerability or license
audit. Missing external audit or signing tools are explicit qualification gaps;
they never cause a source install, network fetch, dependency mutation, or
silent pass during the release-control package.
