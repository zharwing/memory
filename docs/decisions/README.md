# Architecture Decision Records

Architecture decision records explain durable boundaries that code alone does
not make obvious. They capture the context, decision, consequences, and the
conditions under which a decision should be revisited.

## Decision Index

- [ADR 0001: Local-first project boundary](0001-local-first-project-boundary.md)
- [ADR 0002: Progressive public documentation](0002-progressive-public-documentation.md)
- [ADR 0003: Project-bound agent authority](0003-project-bound-agent-authority.md)
- [ADR 0004: Durable document identity and repository ownership](0004-durable-document-identity.md)
- [ADR 0005: Command, resource, and lifecycle authority](0005-command-resource-lifecycle-authority.md)

## Record Rules

- Use a stable four-digit identifier and a descriptive filename.
- Mark the status as proposed, accepted, superseded, or deprecated.
- Name the decision owner and decision date.
- Record the alternatives considered, including why they were not selected.
- State compatibility and migration requirements for existing data and callers.
- State consequences, revisit conditions, and any supersedes/superseded-by link.
- Link a superseding decision in both records.
- State security, privacy, accessibility, and migration consequences directly.
- Keep implementation plans and temporary task state out of ADRs.
- Never include credentials, private project content, or workstation paths.

An ADR describes why a boundary exists. Current APIs and operational commands
remain authoritative in their dedicated reference guides.
