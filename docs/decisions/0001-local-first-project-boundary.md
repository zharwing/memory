# ADR 0001: Local-First Project Boundary

Status: accepted

## Context

Coding-agent context can contain source paths, unfinished decisions, session
history, and other project material that should not become a hosted product
dataset. The application source also needs to remain cloneable and safe to
publish independently of any user's memory.

## Decision

Zharwing Memory separates three ownership domains:

1. versioned application source and public documentation;
2. a user-selected private memory root containing project-scoped Markdown and
   rebuildable projections;
3. OS-owned local authority and diagnostic state outside both source and memory
   content.

The daemon is the domain boundary. Browser, desktop, CLI, and agent adapters do
not read private storage directly. Public documentation is generated only from
an explicit repository allowlist and never from a configured memory root.

## Consequences

- A source checkout can be shared without sharing personal Memory projects.
- Backups and imports operate on explicit project resources rather than the
  public website or application source.
- Moving or recreating a project requires explicit registry and generation
  handling.
- OS authority state must be protected, bounded, and recoverable separately.
- Hosted multi-user behavior is not implied by the local developer preview.

## Revisit When

Revisit this decision only if a separately designed hosted or multi-user
product has explicit tenancy, encryption, retention, deletion, audit, and
authorization models. A hosted mode must not weaken the local boundary by
accident.
