# Frontend rollback runbook

Rollback is an owner-authorized release action. Candidate generation and local
qualification do not perform it.

## Preconditions

1. Identify the incident and the affected released artifact digest.
2. Select the last independently attested artifact for the same product,
   platform, and authority profile.
3. Verify its evidence manifest, SBOM/checksum binding, signature when the
   distribution policy requires one, and artifact SHA-256 from retained bytes.
4. Confirm the artifact is still compatible with the current daemon/RPC
   compatibility window and persisted frontend preference/layout versions.
5. Record owner, reason, target environment, recovery objective, and the exact
   artifact being replaced and restored.

## Restore

Promote the previously attested bytes without rebuilding them. Do not change
dependencies, Git history, credentials, private data, CSP, native capabilities,
privacy projection, audience/project admission, error sanitization, or
destructive confirmation as part of the rollback. Database or private-memory
restoration is a separate authorized operation.

## Verify

Run the platform's post-promotion health and critical read-only checks, verify
the observed artifact digest, and confirm browser/native authority still fails
closed. A post-promotion check cannot replace missing pre-promotion evidence.
If verification fails, stop escalation through the release owner rather than
rebuilding or weakening a gate.

## Evidence

Record the previous and restored artifact digests, manifest identities,
commands, environment, outcome, elapsed recovery time, and any unexpected
skip. Keep browser, Windows/Tauri, signing, screen-reader, and physical-device
truth separate. Close the incident only after the intended candidate or a new
attested repair supersedes the rollback.
