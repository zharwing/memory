# AI Memory Documentation

This folder contains product and engineering documentation for the AI Memory implementation.

## Core Docs

- [Architecture](ARCHITECTURE.md)
  System boundaries, runtime structure, package responsibilities, and privacy flow.

- [Data Model](DATA_MODEL.md)
  Project, session, document, proposal, context bundle, graph, and storage entities.

- [API Reference](API_REFERENCE.md)
  Daemon JSON-RPC methods, CLI commands, MCP tools, and prompt resources.

- [Agent Protocol](AGENT_PROTOCOL.md)
  Project-neutral workflow for any AI agent using AI Memory, plus adapter boundaries.

- [Agent Automation](AGENT_AUTOMATION.md)
  MCP setup, repo bootstrap files, skill template, and automatic session workflow.

- [Repositories](REPOSITORIES.md)
  Flexible multi-repo project links, names, descriptions, pointer files, CLI commands, and MCP tools.

- [Workstreams](WORKSTREAMS.md)
  Multi-day topic/epic grouping for related sessions, docs, and imported memory.

- [User Flows](USER_FLOWS.md)
  First-time setup, daily coding, project return, context preview, inbox review, assistant workflows, backup, and recovery.

- [Desktop UI](DESKTOP_UI.md)
  Browser and Tauri runtime modes, lightweight sidebar model, first-run setup, import workflow, and Trash behavior.

- [Diagrams](DIAGRAMS.md)
  Mermaid diagrams: architecture, UML class diagram, ERD, sequence diagrams, state machines, user flow, context pipeline, storage layout, and backup flow.

- [Operations](OPERATIONS.md)
  Runtime assumptions, configuration, startup, backup, validation, indexing, security, and known constraints.

- [Testing Plan](TESTING_PLAN.md)
  Phased plan for unit and integration tests using node:test over compiled dist output, with privacy and storage first.

- [Importing](IMPORTING.md)
  Generic Markdown import profiles, preview/commit workflow, CLI examples, and MCP usage.

- [Graph Rules](GRAPH_RULES.md)
  Manual and AI/MCP workflows for mapping imported folder layouts into useful context graph nodes.

- [MVP Walkthrough](MVP_WALKTHROUGH.md)
  Quick command-oriented walkthrough of the core MVP loop.

## Reading Order

1. Read the root [README](../README.md).
2. Read [Architecture](ARCHITECTURE.md).
3. Review [Diagrams](DIAGRAMS.md) for system shape.
4. Use [User Flows](USER_FLOWS.md) to understand behavior.
5. Use [Desktop UI](DESKTOP_UI.md) when operating the browser or Tauri app.
6. Use [API Reference](API_REFERENCE.md) when wiring clients.
7. Use [Agent Protocol](AGENT_PROTOCOL.md) when wiring agents or generating agent-specific instructions.
8. Use [Agent Automation](AGENT_AUTOMATION.md) when configuring MCP clients, bootstrap files, or the generic skill.
9. Use [Repositories](REPOSITORIES.md) when linking multiple repos to one memory project.
10. Use [Workstreams](WORKSTREAMS.md) when grouping multi-day topics.
11. Use [Importing](IMPORTING.md) when bringing in existing Markdown memory or session folders.
12. Use [Graph Rules](GRAPH_RULES.md) when imported memory needs better graph hubs.
13. Use [Operations](OPERATIONS.md) when running or packaging the app.

## Documentation Policy

- Diagrams are Mermaid-first so they remain editable Markdown.
- Storage documentation treats Markdown as durable source of truth.
- Any generated or assistant-proposed documentation should be reviewed before becoming canonical.
- Project-scoped behavior should be documented explicitly whenever a feature could otherwise be confused with global behavior.
