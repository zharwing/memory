# Operation admission contract

## Purpose

The operation registry and registrar form the single hardened admission path.
Client method names provide convenience; only a registered operation,
authority-created principal, decoded input, and successful registrar decision
may reach a domain service.

The contract applies to `POST /rpc`, `POST /agent-rpc`, and MCP tool calls
on `POST /mcp`. Browser-session endpoints have their own protocol and never
dispatch domain operations directly.

## Registry authority

`OPERATION_REGISTRY` is exhaustive. Every `memory.*` entry declares:

- runtime input and domain output schemas;
- effect class: `read | proposal | mutation | destructive`;
- exact allowed audiences;
- default project scope and any audience-specific scope override;
- privacy projection surface;
- cancellation behavior;
- idempotency requirement;
- timeout and maximum response bytes;
- invalidated resource IDs;
- RPC compatibility version;
- a closed list of public error codes.

`getOperationAdmissionMetadata`,
`getOperationProjectScope(name, audience)`, and
`operationsForAudience(audience)` read this registry. Unknown names fail
closed. Input decoders reject coercion and unknown properties.

The current audience matrix is:

- `desktop` and `admin`: the complete registered inventory, still
  constrained by principal project binding;
- `browser`: the browser-listed desktop subset; MCP installation and global
  trash list/restore/purge/empty operations are excluded;
- `agent`: exactly eleven MCP operations, all tagged with agent privacy
  projection; startup state is project-required for this audience;
- `provider`: only `memory.check_semantic_graph_provider`;
- `backup`: only backup, list backups, and delete backup.

Registry membership never bypasses the principal's own operation set or
project binding.

## Server pre-admission

Before `OperationRegistrar.authorize` runs, the HTTP adapter:

1. rejects a non-loopback or malformed Host;
2. rejects a non-loopback or non-exact browser Origin and applies
   credentialed, non-wildcard CORS;
3. limits domain ingress to POST and a known endpoint;
4. keeps `/mcp` and `/agent-rpc` disabled unless the agent surface was
   explicitly enabled;
5. authenticates a browser cookie/CSRF/origin/Host tuple or a digest-registered
   non-browser bearer;
6. rejects agent principals on `/rpc` and non-agent principals on
   `/mcp` or `/agent-rpc`;
7. parses a bounded request body.

Requests with an Origin never authenticate a desktop, agent, admin, provider,
or backup bearer. Browser requests never use `Authorization`.

## Registrar denial order

`OperationRegistrar.authorize(context, request)` performs no project storage
or domain service access. Its ordering is intentional:

1. require POST and a loopback Host;
2. enforce Origin semantics: browser requires an exact local Origin, while
   every other audience requires no Origin;
3. recheck the principal against authority time, epoch, revocations, and active
   rotation;
4. enforce endpoint-to-audience compatibility;
5. require the current RPC version and a registered operation name;
6. require both registry audience membership and membership in the principal's
   operation set;
7. require the browser CSRF proof;
8. resolve audience-specific project scope, extract only an exact top-level raw
   `projectId`, and enforce the principal binding;
9. decode the complete input once with the registry schema;
10. require the decoded project ID to equal the raw value admitted above;
11. normalize idempotency metadata and, where applicable, claim the effect or
    return a closed reconciliation outcome.

This order deliberately rejects identity, audience, endpoint, CSRF, and
project-confusion attempts before detailed domain parsing. Input decoding still
happens before dispatch, and no raw parameter object crosses the boundary.

Public failures use the closed error registry. Responses do not expose raw
exceptions, credentials, policy internals, principal claims, storage paths, or
private content.

## Authorized invocation

Success returns an `AuthorizedInvocation` containing:

- optional request ID;
- registered operation name;
- registry-decoded input;
- immutable authenticated principal;
- optional normalized idempotency and correlation IDs;
- the registrar-extracted project ID;
- a private effect claim ID only for a newly claimed consequential operation.

Hardened dispatch accepts this object. It must not re-read authority from raw
headers or select a different project from nested input.

## Idempotency and replay

The optional header is `x-idempotency-key`; operations that define an input
`idempotencyKey` may supply the same value in the body. Accepted keys are
8-256 characters from `A-Z a-z 0-9 : . _ -`.

- malformed presented keys are validation failures;
- different valid header and body keys are a conflict;
- an operation marked `idempotency:"required"` is rejected when the key is
  absent;
- reads are never claimed;
- a consequential operation with a valid supplied key uses the bounded effect
  journal, even when the current registry metadata does not require a key.

The stable effect scope is exactly:

`(sessionOwner, exactProjectId|null, operationName, idempotencyKey)`

Request equivalence is a SHA-256 digest of canonical JSON containing
`{name, projectId|null, decodedInput}`. Thus the same tuple with a different
input is a conflict. The stable owner and exact project intentionally exclude
credential, principal session, rotation, authority epoch, and policy digest:
refreshing those claims must not create a second logical effect. Current
authority, audience, operation, project, CSRF, and input policy is still
rechecked before every journal lookup.

For a new effect, the registrar creates an in-flight private claim before
dispatch. The outcomes are:

- same tuple and different request digest: 409 `conflict`;
- same tuple/digest while in flight: 409 `outcome_unknown`;
- same tuple/digest after completion on every surface: 409 `outcome_unknown`
  and require current-policy reconciliation;
- bounded-ledger capacity exhausted: 503 `unavailable`.

The journal is daemon-owned state outside the project tree. It survives daemon
restart and credential/session/rotation/epoch/policy refresh, has fixed record
and byte bounds, rejects linked or escaped paths, and strictly verifies every
HMAC-protected record. It stores digests, claim IDs, and completion receipts;
it never stores RPC response bytes, credentials, private content, or privacy
projections. `complete(invocation, response)` records only a receipt for the
matching private claim. `abandon` appends a release only when dispatch is known
not to have started, while retaining the original input binding.

This journal deliberately does not claim an atomic transaction with domain
storage. A crash after the claim, including after the domain effect but before
the completion receipt, leaves a durable in-flight record. The retry returns
`outcome_unknown`; it does not run the effect again. A client must reconcile
through current reads, must not infer failure from transport loss, and must not
use a new key merely to escape `outcome_unknown`.

The agent-visible durable operations `memory.start_session`,
`memory.save_checkpoint`, `memory.close_session`, and
`memory.get_context_bundle` are marked `idempotency:"required"`. Agent
adapters must preserve one stable key across uncertainty and reconciliation;
they may not generate a fresh key merely because a call timed out. Other
consequential callers that supply keys receive the journal semantics above.

For hardened MCP, the HTTP adapter owns this key. Each required mutation must
have a string or finite-number JSON-RPC request ID. The adapter hashes the
typed identity (`string` and `number` remain distinct) together with the
registered operation under the `zharwing.mcp-idempotency.v1` domain and
passes the bounded `mcp:v1:<sha256>` key to the registrar. Retries must reuse
the same JSON-RPC ID. Batch calls use each member's own ID. The adapter ignores
the compatibility payload key for `memory.get_context_bundle` and ignores
the HTTP idempotency header for required MCP mutations; neither caller field
may replace the derived key. Missing IDs fail closed, and unrelated unknown
input fields remain registry validation errors.

## Domain output and agent projection

For human/native surfaces, `dispatchAuthorizedRpc` validates the domain
result with the operation registry's output schema before returning it. The
typed browser/desktop/admin/provider/backup contract is therefore the
registered domain output.

For ordinary non-context operations, hardened agent dispatch first obtains the
same registry-decoded domain result, then crosses the central privacy
projector. Context operations use their typed context-builder result and cross
the same projector. The public result is intentionally a different schema:

- ordinary agent results:
  `zharwing.agent-projection.v1` with `data` and sanitized completeness;
- agent context results:
  `zharwing.memory.bundle.v1` with bounded sections, budget, safety status,
  and sanitized completeness;
- a committed effect whose result cannot be disclosed: a bounded
  `resultVisibility:"withheld"` acknowledgement.

These agent envelopes are raw JSON projection contracts and must not be parsed
as the human operation output schema. MCP and `/agent-rpc` use the same
registrar and hardened agent projector. A denied agent read returns a closed
error; it never falls through to ordinary RPC serialization.

The legacy raw agent result exists only in the
`personal-preview`, no-Origin compatibility dispatcher. It is not valid
evidence for hardened schema, admission, privacy, or replay behavior.

## Profiles and rollback

`hardened-local` requires token/session authentication on an exact loopback
bind. Every domain ingress uses the registrar; every agent result uses central
privacy projection.

`personal-preview` preserves the isolated legacy dispatcher for migration.
Its browser compatibility session is available only with explicit
`authMode=none`, and only on loopback. The preview branch must not be invoked
as automatic fallback after a hardened denial.

Rollback is a daemon restart under one complete profile. It invalidates
process-local principals, browser sessions, and rotations, but not durable
effect receipts. Clients must lock and reconnect, then reconcile any
`outcome_unknown` result. Never combine the preview dispatcher with hardened
cookies or treat client compatibility version as authorization.

## Client obligations and focused evidence

Clients must send RPC compatibility version 1, one registered method, an
exactly shaped input, the required top-level project ID, and only bounded
correlation/idempotency metadata. A browser additionally sends credentials and
CSRF; a trusted agent uses its distinct project-bound credential.

Focused tests cover all registered operations and six audiences, audience
scope overrides, unknown names, wrong version, endpoint confusion, Origin
confusion, CSRF, raw/decoded project mismatch, expiry/revocation/rotation,
idempotency mismatch/in-flight/completed/capacity cases, durable identity
across session/rotation/epoch/policy refresh and restart, journal
HMAC/corruption/link/size defenses, human output decoding, and both hardened
agent envelopes. Fixtures and canaries are synthetic.
