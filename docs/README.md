# Zharwing Memory Documentation

This folder contains product and engineering documentation for the Zharwing Memory implementation.

## Core Docs

- [Setup](SETUP.md)
  Supported runtimes, local profiles, browser/desktop startup, agent boundary,
  and public documentation generation.

- [Frontend V2 Implementation Status](FRONTEND_V2_IMPLEMENTATION_STATUS.md)
  Current browser/desktop architecture and an explicit separation between
  implemented source and release/device qualification.

- [Developer Preview Boundary](DEVELOPER_PREVIEW.md)
  Implemented `personal-preview` and `hardened-local` profiles, limitations,
  migration boundary, and claim rules.

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
  Flexible multi-repo project links, names, descriptions, pointer files, CLI commands, and daemon administration methods.

- [Workstreams](WORKSTREAMS.md)
  Multi-day topic/epic grouping for related sessions, docs, and imported memory.

- [User Flows](USER_FLOWS.md)
  First-time setup, daily coding, project return, context preview, inbox review, assistant workflows, backup, and recovery.

- [Browser UI](WEB_UI.md)
  Cookie/CSRF browser authority, explicit local preview startup, hardened
  bootstrap requirements, browser-versus-desktop differences, and recovery.

- [Browser And Desktop UI](DESKTOP_UI.md)
  Shared navigation, browser and Tauri runtime modes, first-run setup, import
  workflow, opt-in session graph visibility, and Trash behavior.

- [Diagrams](DIAGRAMS.md)
  Mermaid diagrams: architecture, UML class diagram, ERD, sequence diagrams, state machines, user flow, context pipeline, storage layout, and backup flow.

- [Operations](OPERATIONS.md)
  Runtime assumptions, configuration, startup, backup, validation, indexing, security, and known constraints.

- [Testing Plan](TESTING.md)
  Exact frontend commands, source coverage, integrated gate order, and the
  boundary between CI, local source completion, and release/device evidence.

- [Frontend V2 Migration](migration/frontend-v2-migration.md)
  Profile selection, role credentials, visibility, preferences, graph layout,
  compatibility windows, and rollback.

- [Frontend V2 Compatibility Register](migration/frontend-v2-compatibility-register.md)
  Dated retained/removed compatibility paths, active callers, removal proof,
  and residual risk.

- [Frontend Qualification Matrix](qualification/frontend-qualification-matrix.md)
  Honest per-surface source observations, unrun candidate gates, deferred
  device evidence, and release claim rules.

- [Testing With AI Providers](AI_TESTING.md)
  Manual LM Studio/Ollama/llama.cpp-style provider checks, session TLDR tests, and semantic graph smoke tests.

- [Importing](IMPORTING.md)
  Generic Markdown import profiles, preview/commit workflow, CLI examples, and daemon administration usage.

- [Graph Rules](GRAPH_RULES.md)
  Manual and AI-assisted administration workflows for mapping imported folder
  layouts into useful context graph nodes, including the opt-in rule for
  session nodes.

- [Semantic Graph Analysis](SEMANTIC_GRAPH.md)
  Optional LLM-assisted relationship analysis, review modes, local provider setup, approval flow, and storage.

- [MVP Walkthrough](MVP_WALKTHROUGH.md)
  Quick command-oriented walkthrough of the core MVP loop.

- [Source And Context Boundary](SOURCE_CONTEXT.md)
  Explicit public-source allowlist, generated direct pages, bounded search
  projection, synthetic evidence, and private-context exclusions.

- [Architecture Decision Records](decisions/README.md)
  Durable local-first, progressive-documentation, and project-bound-authority
  decisions with their context and consequences.

## Reading Order

1. Read the root [README](../README.md).
2. Use [Setup](SETUP.md) to choose a profile and start the intended surface.
3. Read [Frontend V2 Implementation Status](FRONTEND_V2_IMPLEMENTATION_STATUS.md)
   and [Developer Preview](DEVELOPER_PREVIEW.md) before making a readiness claim.
4. Read [Architecture](ARCHITECTURE.md) and [Diagrams](DIAGRAMS.md).
5. Use [Browser UI](WEB_UI.md) and [Browser And Desktop UI](DESKTOP_UI.md)
   for human-interface setup and operation.
6. Use [Frontend V2 Migration](migration/frontend-v2-migration.md) before
   changing a profile, credential, visibility default, or persisted cache.
7. Use [Testing](TESTING.md) and the
   [Qualification Matrix](qualification/frontend-qualification-matrix.md)
   before any source-complete or release/device claim.
8. Continue with the domain guides below for agent, repository, import, graph,
   provider, and operations work.
9. Read [Source And Context Boundary](SOURCE_CONTEXT.md) before changing the
   public website, its direct pages, or its search index.
10. Add durable boundary decisions to the
    [Architecture Decision Records](decisions/README.md).

## Documentation Policy

- Diagrams are Mermaid-first so they remain editable Markdown.
- Storage documentation treats Markdown as durable source of truth.
- Generated or assistant-proposed documentation follows the project's memory
  write mode: direct by default, with Memory Inbox review available when the
  project enables it or the update is risky or uncertain.
- Project-scoped behavior should be documented explicitly whenever a feature could otherwise be confused with global behavior.
