# Central privacy projection

## Security invariant

Authorization answers whether a principal may invoke an operation. Privacy
projection separately answers which parts of a successful result may cross the
requested surface. An operation allowlist, a project match, or an allowed
wrapper object never makes all nested data safe.

`projectStructuredResult(value, context)` from
`@zharwing/memory-privacy` is the general structured-data crossing. Hardened
agent and provider results must pass through it after registry decoding and
before serialization. No agent endpoint may serialize a raw domain result or
implement a second visibility default.

## Projection input

`PrivacyProjectionContext` supplies:

- the authority-created `AuthenticatedPrincipal`;
- the exact project ID, when the operation is project-bound;
- the output `surface`, one of the six principal audiences;
- the current project `PrivacyPolicy`;
- the operation name;
- one explicit profile;
- bounded item, UTF-8 byte, and recursion-depth limits.

The principal audience must equal the surface. The operation must be in the
principal operation set. When a project is supplied, it must equal the
principal's exact non-null project binding. Failure of any of these outer gates
denies the complete projection.

The profile type prevents accidental legacy fallback:

- `{profile: "hardened-local"}` cannot provide a fallback visibility;
- `{profile: "personal-preview", legacyMissingVisibility: ...}` must provide
  one explicitly.

`privacyPolicyFor("hardened-local", policy)` and
`visibilityOrReviewRequired(value)` provide the matching safe policy
construction: missing or malformed values become `review-required`, never
`ai-eligible`.

## Projection result

`PrivacyProjectionResult<T>` contains:

- `allowed` and, only when allowed, projected `data`;
- authority-owned `provenance` with schema version, principal/session,
  audience/surface, project, operation, policy digest, authority epoch, and
  profile;
- `completeness` with `complete | partial | denied` and source, included,
  excluded, and truncated counts;
- aggregate exclusion reason counts;
- aggregate redaction kind/severity/replacement counts.

Exclusion and redaction ledgers never contain source IDs, titles, paths,
content, matched secret values, or object locations. Principal/session
provenance is daemon evidence and is not serialized to an agent response.

## Restricted-surface decisions

`agent` and `provider` are restricted surfaces. For each recognized privacy
entity:

1. a different explicit or inherited project is excluded;
2. visibility is resolved under the selected profile;
3. only `ai-eligible` and `ai-pinned` are allowed;
4. `review-required`, `human-only`, `private`, and `never-send` are
   excluded;
5. missing visibility is excluded in `hardened-local`;
6. malformed visibility is always excluded;
7. an entity with a high-risk secret is excluded when
   `blockOnHighRiskSecrets` is enabled;
8. an entity whose path matches a never-send or ignored pattern is excluded.

Visibility is evaluated for nested disclosure units, not merely their parent.
Recognized units include sessions and checkpoints, context sections, documents,
search/evidence records, workstreams, proposals, graph/semantic entities,
repository links, and compact startup project/repository summaries. Compact
legacy startup records are deliberately treated as entities even when their
old wire shape lacks visibility.

Arrays are visited member by member, so one blocked member is removed without
authorizing its siblings. Nested objects are visited recursively. Path-like
fields such as `sourcePath`, `repoRoot`, `workingDirectory`,
`memoryRoot`, and touched/affected file lists are stripped on restricted
surfaces. Legacy per-item exclusion ledgers are stripped and replaced by safe
aggregate counts.

Every string is secret-scanned. Policy may reject a high-risk value or redact
recognized values before byte accounting. Item, byte, and depth overflow drops
the affected value and reports partial/truncated completeness. A partial
result must never be rendered or described as complete.

Browser, desktop, admin, and backup are not restricted disclosure surfaces in
this projector, but the outer audience, operation, and exact-project gates
still apply. They continue to receive only their registrar-authorized domain
result.

## Hardened agent wire contracts

The operation registry's output schema is the internal/human domain contract.
Hardened agent egress intentionally has a separate public projection contract:

- ordinary results use
  `{schema:"zharwing.agent-projection.v1", status:"ok", data, completeness}`;
- context preview/get operations use
  `{schema:"zharwing.memory.bundle.v1", status:"ok", projectId, ...,
  sections, budget, completeness, safetyStatus}`.

Agent completeness contains only `status`, `excludedItems`,
`redactions`, and `truncatedItems`. It combines context-builder exclusions
with projector exclusions and budget truncation.

For a denied read, the hardened facade returns a closed forbidden error. If a
mutation is already known to have committed but its result entity is denied,
the facade returns a bounded acknowledgement:
`{status:"accepted", operation, projectId?, resultVisibility:"withheld"}`.
It must not convert a committed effect into a retryable failure or disclose the
rejected entity.

The legacy `dispatchAgentRpc` raw-result shape exists only behind the
`personal-preview`, no-Origin compatibility path. It is not a hardened
projection contract and must never be reachable from hardened MCP or
`/agent-rpc`.

## Authority-owned session classification

Legacy session Markdown often has no visibility field. Hardened projection
must not infer that such a session is agent-visible.

Only the admitted hardened agent-write path may call
`classifyAgentWrittenSession`:

- after `memory.start_session`, it records the newly created session as
  agent-owned;
- after `memory.save_checkpoint`, it may classify the latest returned
  checkpoint only when the containing session is already bound to the same
  stable agent owner and exact previously classified revision;
- `memory.close_session` has the same owner/revision check and classifies its
  resulting revision;
- agent creation never auto-closes human sessions.

The durable record lives in the daemon-controlled per-user state directory,
outside projects, repositories, memory roots, and backup roots. Each
`zharwing.session-authority.v3` line contains only a hashed memory-root
namespace, project generation digest, project/session IDs, stable owner,
fixed agent-operation provenance, exact session and summary revision digests,
an exact checkpoint ID/digest for checkpoint writes,
`visibility:"ai-eligible"`, time, and an HMAC. It contains no credential,
content, title, summary, or project path. The HMAC key is a separate owner-only
state file. Appends are serialized and the ledger is bounded to 4 MiB.

Ledger reading is fail closed:

- missing or unreadable ledger means no granted classifications;
- an oversized ledger grants nothing;
- malformed JSON, unexpected fields, invalid namespace/generation/visibility,
  an invalid HMAC, unsafe link/path, oversized file, or any corrupt line
  invalidates the whole read;
- an explicit visibility already stored on the session is never overwritten by
  ledger lookup.

Session list/latest/detail reads merge valid authority classification. This
survives daemon restart without editing user-authored Markdown. A human or
legacy session with missing visibility remains unclassified. Saving or closing
such a session is refused before dispatch. Explicit review/migration is
required to make old data agent-visible.

A session grant applies only while the complete stored session matches an
HMAC-authenticated classified revision. Every admitted agent checkpoint has
its own session-bound ID/content digest and never inherits visibility merely
from the session. Before save or close, the authority check captures the exact
classified base snapshot. After the write, classification requires both the
current persisted revision and returned domain result to match one
deterministic transition: an unchanged checkpoint prefix plus exactly the
admitted checkpoint, or an otherwise unchanged close transition. Hardened
agent close disables automatic summary follow-up because that is a separate
control-plane mutation. Any mismatch returns `outcome_unknown` without
appending authority.

The compact summary is a separate mutable read. After observing it and before
signing, the authority store must re-read the complete session and match the
same exact classified revision. This prevents an old full-session digest from
being signed alongside a newer human summary digest; list, latest, and startup
views remain unclassified when that barrier detects a change.

A later human/control-plane checkpoint, summary, metadata, or body-only edit
changes the session revision without creating authority: the session
disclosure unit becomes hidden, the new checkpoint remains unclassified, and
a later agent write is refused instead of promoting the mixed content.

The service-level compare is deliberately fail closed but is not yet a
storage-atomic compare-and-swap. A writer racing after the agent storage layer
has read its base may still be overwritten, and a crash between domain write
and authority append remains an `outcome_unknown` reconciliation case. The V2
repair is an expected-revision conditional write or per-session transaction in
the storage package; it must preserve the same HMAC authority record and
deterministic transition checks.

Search results inherit visibility from the classified source corpus before
projection. The join key is `entity type + id`, so an equal identifier in a
workstream, session, document, or proposal cannot relabel another family.
Session details are promoted to a single disclosure unit using the exact
current-revision visibility, so dropping a blocked nested summary can never
leave its body or checkpoints behind. Startup-derived counts, actions,
readiness, and copy are removed before projection and rebuilt from the
included records by the agent adapter.

If classification fails after a domain write, the facade reports
`outcome_unknown`, because blindly retrying could duplicate a durable session
or checkpoint.

## Profile and rollback rules

`hardened-local` always uses fail-closed missing visibility and the central
projector. There is no runtime flag that may turn its missing values into
`ai-eligible`.

`personal-preview` may use legacy missing-visibility behavior only through an
explicitly typed projection context or its isolated compatibility dispatcher.
Projection provenance records the selected profile.

Rollback changes the complete daemon profile and restarts authority. It must
not delete or rewrite the classification ledger, silently bulk-classify legacy
sessions, or copy preview defaults into hardened policy. On return to hardened
mode, the ledger is re-read fail closed and all non-classified legacy data
remains hidden.

## Synthetic canary matrix

Focused evidence crosses:

- all six principal audiences against all six surfaces;
- exact and wrong project;
- each visibility, plus missing and malformed visibility;
- agent-owned and legacy session/checkpoint histories;
- nested arrays, allowed wrapper/blocked child, startup summaries, repo links,
  and context sections;
- ignored and never-send paths;
- low/medium/high-risk synthetic secrets;
- item, byte, token, and depth limits;
- hardened and explicit preview profiles;
- ordinary agent envelope, context bundle envelope, denied read, and committed
  result-withheld acknowledgement.

Assertions check both absence of the canary and truthful
complete/partial/denied reporting. Tests use synthetic values only.
