# ADR 0004: Durable Document Identity And Repository Ownership

Status: accepted  
Owner: Zharwing Memory maintainers  
Decision date: 2026-08-14  
Supersedes: none  
Superseded by: none

## Context

Older Markdown documents may not contain an `id` field, while imported documents
may contain opaque identifiers outside the grammar used for new records. Creating
a random identifier during every read makes list, search, update, delete, graph,
backup, and restore disagree about the identity of the same file. Rewriting a
whole frontmatter block merely to add an ID also destroys comments, ordering,
delimiters, BOMs, or newline style that Zharwing Memory does not own.

## Decision

`DocumentRepository` is the single storage owner for document discovery, reads,
writes, lookup, identity materialization, backup identity snapshots, and restore
verification. A document with a stored nonblank ID keeps those exact bytes. A
document without one receives a deterministic compatibility identity derived
from the exact project ID and normalized project-relative path; ordinary reads
never write it. New documents receive a stored ID once. Explicit migrations and
authorized writes insert only the missing `id` field through the raw Markdown
patcher while preserving all unowned bytes.

## Alternatives Considered

- Generate a random ID on read: rejected because identity changes between calls.
- Use paths as public IDs: rejected because paths leak storage structure and do
  not survive all controlled moves.
- Rewrite parsed frontmatter on migration: rejected because serialization would
  alter user-owned formatting and unknown fields.
- Reject historical opaque IDs: rejected because it would break existing data
  and wire references.

## Consequences

- Every document consumer observes one stable identity.
- Legacy path-derived IDs remain deterministic until explicitly materialized.
- Raw Markdown handling is more deliberate than generic serialization.
- Duplicate stored IDs must be reported and resolved rather than silently
  reassigned.

## Migration And Compatibility

Existing nonblank IDs remain byte-for-byte compatible. Missing IDs remain
readable without mutation and can be materialized by the versioned migration or
an authorized write. Root storage function exports remain compatibility facades
over the repository during the migration window.

## Revisit When

Revisit only if documents move to a transactional store with an explicit,
lossless Markdown round-trip and a migration that preserves every existing ID
and external reference.
