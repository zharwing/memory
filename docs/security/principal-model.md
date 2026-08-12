# Principal and authority model

## Scope and security invariant

This document defines the FE03 authority boundary shared by the browser,
desktop, agent, provider, backup, and administrative surfaces. The daemon
decides whether an operation may run. A route, React screen, MCP tool name, or
TypeScript client method is never authority.

The only object application dispatch may trust is an
`AuthenticatedPrincipal<OperationName>` created by the daemon authority.
Request JSON cannot construct the `authenticated: true` proof or widen any
claim.

## Immutable claims

`PrincipalClaims` contains all of the following fields:

- `principalId`: stable identity within the local authority;
- `sessionId` and `sessionOwner`: one bounded authority session and its
  trusted owner/composition;
- `audience`: exactly one of the six audiences below;
- `operations`: a non-empty, unique set of registered operation names;
- `projectId`: one exact project, or `null` for global authority;
- `issuedAt` and `expiresAt`: authority-clock validity bounds;
- `authorityEpoch`: the daemon generation that issued the claims;
- `policyDigest`: the policy context used for provenance and replay
  isolation;
- `rotationId`: the currently active credential/session rotation;
- `revocationId`: an independently revocable identifier.

The authority freezes both the principal and its operation set. It retains
SHA-256 digests of bearer credentials, never the raw credential. Invalid
timestamps, future issuance, expiry, a stale epoch, a revoked principal,
session, or revocation identifier, and a superseded rotation all fail closed.
Advancing the authority epoch removes registered credentials and active
rotations for the old generation.

## Six audiences

Audience grants are derived from the exhaustive operation registry and are
then intersected with the principal's exact operation set and project binding.

| Audience | Intended carrier and current operation boundary |
| --- | --- |
| `browser` | An origin/Host-bound HttpOnly cookie plus in-memory CSRF token. It receives only browser-listed operations; global MCP installation and global trash controls are explicitly excluded. |
| `desktop` | Trusted native/desktop composition. The current registry exposes the full operation inventory, still constrained by exact project binding. |
| `agent` | A distinct trusted-host credential, never the admin credential. Its exact set is `health`, startup state, latest/recent/session detail, start/close session, save checkpoint, search, and preview/get context bundle. |
| `admin` | The compatibility daemon token is registered as `local-admin`. The registry exposes the full inventory, but project-required operations still require a separately exact non-null project binding. |
| `provider` | Only `memory.check_semantic_graph_provider`. Provider egress is also a restricted privacy surface. |
| `backup` | Only `memory.backup_project`, `memory.list_backups`, and `memory.delete_backup`. |

`operationsForAudience(audience)` is derived from the registry. There is no
parallel hand-maintained allowlist. The agent constant `AGENT_OPERATIONS` is
derived the same way and is asserted against the eleven MCP-supported
operations.

## Project binding

For a project-required operation:

1. the request must contain one exact top-level string `projectId`;
2. the operation's registry metadata must require a project for that audience;
3. the principal must have the same non-null `projectId`.

A global principal does not gain every project. Supplying a project ID to a
registry-global compatibility operation also does not let a null-bound
principal claim that project. A project-bound principal may
invoke a registry-global operation when its audience and operation set allow
it, but it cannot substitute a different project identifier. Audience-specific
scope overrides are authoritative; startup state is project-required for both
browser and agent audiences so working-directory discovery cannot become a
project-selection channel.

## Credential and session composition

### Administrative compatibility credential

`createDaemonAdmissionServices` registers the configured daemon token as an
`admin` principal when token authentication is enabled. The raw token is
accepted once at composition and only its digest remains in
`AuthorityService`.

### Trusted agent credential

Agents must not reuse the admin credential. A trusted host either calls:

- `createAgentCredential()` to create an opaque value; and
- `registerAgentCredential(admission, grant)` to register it.

The grant requires an exact project, principal identity, session owner, TTL,
and optional policy digest, or launches hardened-local with distinct
`ZHARWING_MEMORY_AGENT_CREDENTIAL` and
`ZHARWING_MEMORY_AGENT_PROJECT_ID` values in its private process environment.
The configured pair is required when the hardened agent surface is enabled;
personal-preview retains its isolated legacy compatibility path. Registration always fixes the audience to
`agent` and the operation set to `AGENT_OPERATIONS`. No HTTP route issues,
widens, or registers an agent credential. Enabling `/mcp` and
`/agent-rpc` additionally requires
`ZHARWING_MEMORY_AGENT_SURFACE=enabled`.

### Browser authority

Browser authority is created only by the protocol in
`docs/security/browser-session.md`. Browser JavaScript receives no bearer
credential and cannot construct an agent or admin transport.

## Admission and dispatch boundary

The server authenticates the presented cookie or bearer, then
`OperationRegistrar.authorize` rechecks that the principal is current and
intersects four independent constraints:

1. endpoint-to-audience compatibility;
2. operation-registry audience membership;
3. the principal operation set;
4. exact audience-specific project scope.

Only the resulting `AuthorizedInvocation`, containing registry-decoded input,
may enter hardened dispatch. `/rpc` rejects agent principals;
`/agent-rpc` and `/mcp` accept only agent principals. A browser Origin can
never exercise a desktop, agent, admin, provider, or backup bearer.

## Profiles and rollback

`personal-preview` remains the migration compatibility default. It is not
evidence of browser isolation. Its legacy no-Origin dispatcher and optional
unauthenticated browser preview exist only within that profile.

`hardened-local` must be selected as a complete profile. It requires token or
session authentication and an exact loopback bind. Hardened requests cannot
fall through to raw dispatch, legacy missing-visibility behavior, or the
personal-preview browser-session endpoint.

Rollback is profile-level, not control-by-control:

1. stop the daemon;
2. select `personal-preview` deliberately and restart;
3. discard old cookies, CSRF values, and agent credentials;
4. reconnect clients through the selected profile's own entrypoint.

A restart creates a new process-local authority, so old sessions and replay
claims must be treated as invalid. Do not combine a hardened browser session
with the legacy bearer dispatcher, retain hardened agent credentials after
rollback, or enable individual hardened controls while depending on preview
missing-visibility semantics.

## Verification obligations

Synthetic tests must cover all six audience sets, global versus project
binding, future/expired claims, stale epochs, each revocation dimension,
rotation replacement, endpoint confusion, browser-Origin bearer confusion,
and attempts to supply caller-authored claims. No test fixture may use a real
credential, private path, or secret.
