# Destructive confirmation intents

## Protocol

Permanent effects use a server-owned confirmation protocol:

1. The client requests preparation with the exact operation, project,
   canonical target identifier, and target digest.
2. The daemon binds a fresh intent to the authenticated principal, session,
   authority epoch, policy digest, project, operation, target, and expiry.
3. The UI presents the daemon-owned summary and asks for explicit confirmation.
4. Commit atomically claims the intent before dispatch. Exactly one terminal
   winner can commit, cancel, expire, or fail the intent.

Intents expire after two minutes, are non-replayable, and cannot be widened by
the client. Reauthentication, policy/epoch change, principal/session change,
project switch, target digest change, cancellation, or prior claim invalidates
the commit. GET, HEAD, prefetch, render, and focus events never prepare or
commit an effect.

Direct dispatch of a registered destructive operation is denied at the daemon
boundary. The confirmation wrapper is the only production path. UI preference
for hiding confirmation is ignored for permanent actions; refusal retains form
values and restores focus without performing the effect.

## Project and recovery authority

Trash list, restore, purge, and empty requests carry an exact project. The
daemon filters and revalidates each target under that project. Deleted-project
recovery requires a separately narrow recovery grant; a null-bound or reusable
desktop principal is not a substitute.

Path-bearing effects treat dialog output and request fields as hostile input.
The daemon canonicalizes the path, rejects links and policy escapes, and binds
the canonical target/digest into the intent before commit.

## Outcome handling

The intent claim precedes the domain effect. A known pre-effect refusal is safe
to correct and prepare again. A lost response after claim is outcome unknown;
the client reconciles the authoritative target and must not replay the intent
or silently generate a new one. Audit recording is bounded, durable before the
effect, and excludes secret or content payloads.

## Verification obligations

- Happy path commits exactly once.
- Replay, expiry, cancellation, principal/session/epoch/policy/project change,
  target substitution, and concurrent commit/cancel races fail closed.
- Direct destructive RPC and speculative requests cannot bypass preparation.
- Trash and restore cannot cross project authority.
- Confirmation refusal preserves user input and returns focus.
