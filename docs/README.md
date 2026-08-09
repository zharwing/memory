# Zharwing Memory Documentation

This folder contains product and engineering documentation for the Zharwing Memory implementation.

## Core Docs

- [Architecture](ARCHITECTURE.md)
  System boundaries, runtime structure, package responsibilities, and context safety flow.

- [Data Model](DATA_MODEL.md)
  Project, session, document, proposal, context bundle, graph, and storage entities.

- [API Reference](API_REFERENCE.md)
  Daemon JSON-RPC methods, CLI commands, MCP tools, and prompt resources.

- [Agent Protocol](AGENT_PROTOCOL.md)
  Project-neutral workflow for any AI agent using Zharwing Memory, plus adapter boundaries.

- [Agent Automation](AGENT_AUTOMATION.md)
  MCP setup, repo bootstrap files, skill template, and automatic session workflow.

- [MCP Setup](MCP_SETUP.md)
  Codex, Claude Code, Claude Desktop, HTTP vs stdio, auth modes, Windows/WSL,
  and troubleshooting.

- [Repositories](REPOSITORIES.md)
  Flexible multi-repo project links, names, descriptions, pointer files, CLI commands, and daemon control-plane methods.

- [Workstreams](WORKSTREAMS.md)
  Multi-day topic/epic grouping for related sessions, docs, and imported memory.

- [User Flows](USER_FLOWS.md)
  First-time setup, daily coding, project return, context preview, inbox review, assistant workflows, backup, and recovery.

- [Browser UI](WEB_UI.md)
  Complete local browser startup, daemon and token configuration, daily use,
  browser-versus-desktop differences, and troubleshooting.

- [Browser And Desktop UI](DESKTOP_UI.md)
  Shared navigation, browser and Tauri runtime modes, first-run setup, import
  workflow, opt-in session graph visibility, and Trash behavior.

- [Diagrams](DIAGRAMS.md)
  Mermaid diagrams: architecture, UML class diagram, ERD, sequence diagrams, state machines, user flow, context pipeline, storage layout, and backup flow.

- [Operations](OPERATIONS.md)
  Runtime assumptions, configuration, startup, backup, validation, indexing, security, and known constraints.

- [Testing Plan](TESTING_PLAN.md)
  Phased plan for unit and integration tests using node:test over compiled dist output, with privacy and storage first.

- [Testing With AI Providers](AI_TESTING.md)
  Manual LM Studio/Ollama/llama.cpp-style provider checks, session TLDR tests, and semantic graph smoke tests.

- [Importing](IMPORTING.md)
  Generic Markdown import profiles, preview/commit workflow, CLI examples, and daemon control-plane usage.

- [Graph Rules](GRAPH_RULES.md)
  Manual and AI-assisted control-plane workflows for mapping imported folder
  layouts into useful context graph nodes, including the opt-in rule for
  session nodes.

- [Semantic Graph Analysis](SEMANTIC_GRAPH.md)
  Optional LLM-assisted relationship analysis, review modes, local provider setup, approval flow, and storage.

- [MVP Walkthrough](MVP_WALKTHROUGH.md)
  Quick command-oriented walkthrough of the core MVP loop.

## Reading Order

1. Read the root [README](../README.md).
2. Read [Architecture](ARCHITECTURE.md).
3. Review [Diagrams](DIAGRAMS.md) for system shape.
4. Use [User Flows](USER_FLOWS.md) to understand behavior.
5. Use [Browser UI](WEB_UI.md) to run Memory in a browser.
6. Use [Browser And Desktop UI](DESKTOP_UI.md) for the shared navigation and workflows.
7. Use [API Reference](API_REFERENCE.md) when wiring clients.
8. Use [Agent Protocol](AGENT_PROTOCOL.md) when wiring agents or generating agent-specific instructions.
9. Use [MCP Setup](MCP_SETUP.md) when connecting Codex, Claude, or another MCP client.
10. Use [Agent Automation](AGENT_AUTOMATION.md) when configuring bootstrap files or the generic skill.
11. Use [Repositories](REPOSITORIES.md) when linking multiple repos to one memory project.
12. Use [Workstreams](WORKSTREAMS.md) when grouping multi-day topics.
13. Use [Importing](IMPORTING.md) when bringing in existing Markdown memory or session folders.
14. Use [Graph Rules](GRAPH_RULES.md) when imported memory needs better graph hubs.
15. Use [Semantic Graph Analysis](SEMANTIC_GRAPH.md) when enabling AI-reviewed relationships.
16. Use [Testing With AI Providers](AI_TESTING.md) when checking LM Studio, session TLDR generation, or another model-backed provider.
17. Use [Operations](OPERATIONS.md) when running or packaging the app.

## Documentation Policy

- Diagrams are Mermaid-first so they remain editable Markdown.
- Storage documentation treats Markdown as durable source of truth.
- Generated or assistant-proposed documentation follows the project's memory
  write mode: direct by default, with Memory Inbox review available when the
  project enables it or the update is risky or uncertain.
- Project-scoped behavior should be documented explicitly whenever a feature could otherwise be confused with global behavior.
