# AI Memory Documentation

This folder contains product and engineering documentation for the AI Memory implementation.

## Core Docs

- [Architecture](ARCHITECTURE.md)
  System boundaries, runtime structure, package responsibilities, and privacy flow.

- [Data Model](DATA_MODEL.md)
  Project, session, document, proposal, context bundle, graph, and storage entities.

- [API Reference](API_REFERENCE.md)
  Daemon JSON-RPC methods, CLI commands, MCP tools, and prompt resources.

- [User Flows](USER_FLOWS.md)
  First-time setup, daily coding, project return, context preview, inbox review, assistant workflows, backup, and recovery.

- [Diagrams](DIAGRAMS.md)
  Mermaid diagrams: architecture, UML class diagram, ERD, sequence diagrams, state machines, user flow, context pipeline, storage layout, and backup flow.

- [Operations](OPERATIONS.md)
  Runtime assumptions, configuration, startup, backup, validation, indexing, security, and known constraints.

- [MVP Walkthrough](MVP_WALKTHROUGH.md)
  Quick command-oriented walkthrough of the core MVP loop.

## Reading Order

1. Read the root [README](../README.md).
2. Read [Architecture](ARCHITECTURE.md).
3. Review [Diagrams](DIAGRAMS.md) for system shape.
4. Use [User Flows](USER_FLOWS.md) to understand behavior.
5. Use [API Reference](API_REFERENCE.md) when wiring clients.
6. Use [Operations](OPERATIONS.md) when running or packaging the app.

## Documentation Policy

- Diagrams are Mermaid-first so they remain editable Markdown.
- Storage documentation treats Markdown as durable source of truth.
- Any generated or assistant-proposed documentation should be reviewed before becoming canonical.
- Project-scoped behavior should be documented explicitly whenever a feature could otherwise be confused with global behavior.
