# ADR 0003: Project-Bound Agent Authority

Status: accepted

## Context

An agent needs a small daily-memory surface, but administrator, browser,
desktop, provider, and backup operations have different authority and privacy
requirements. Reusing one local token across those audiences would let an
adapter bypass project scope or expose human-only content.

## Decision

Agent access uses a distinct expiring principal with an explicit audience,
operation set, project binding, authority epoch, policy digest, rotation ID,
and revocation ID. Trusted hosts register raw credentials and the daemon keeps
only bounded credential digests. Production agent entrypoints use the same
operation registry, input decoder, registrar, project authorization, privacy
projection, strict result decoder, and public error model.

Missing visibility is denied in the hardened profile. Human-only and never-send
content cannot cross agent or provider projection. Consequential calls derive a
stable operation-bound identity from the original JSON-RPC request identity and
persist a domain reconciliation marker when a lost response could otherwise
duplicate work.

## Consequences

- Agent credentials cannot administer the daemon or silently fall back to an
  administrator token.
- Switching projects requires new exact authority; a route parameter is not
  authority.
- Privacy projection can return truthful partial completeness without exposing
  excluded content.
- Unknown mutation outcomes must be reconciled with the original identity.
- Compatibility preview behavior remains explicit and cannot be presented as
  hardened behavior.

## Revisit When

Revisit when a new audience or cross-project workflow is introduced. The new
flow must define its own resource authority and privacy surface; it cannot be
added by widening the agent principal.
