# CLI Adapter

Use this adapter when an agent can run local shell commands but does not have
Zharwing Memory MCP tools.

## Startup

```bash
zharwing-memory detect <working-directory>
zharwing-memory status --project <project-id>
zharwing-memory resume --project <project-id>
zharwing-memory search --project <project-id> "<task, feature, error, or file>"
```

Start a session when the work is meaningful:

```bash
zharwing-memory start "<task title>" --project <project-id> --agent <agent-name>
```

Attach a known workstream when appropriate:

```bash
zharwing-memory start "<task title>" --project <project-id> --agent <agent-name> --workstream <workstream-id>
```

## Context

Preview context before using it in a prompt:

```bash
zharwing-memory context --project <project-id> --preview --task "<task>"
```

Persist the bundle when it is actually used:

```bash
zharwing-memory context --project <project-id> --session <session-id> --task "<task>"
```

## Progress

```bash
zharwing-memory checkpoint --project <project-id> --session <session-id> "summary" \
  --next "next step" \
  --file "path/to/file"
```

Close when the work round is done:

```bash
zharwing-memory close --project <project-id> --session <session-id> "summary" \
  --next "next step"
```

## Agent Instructions

Generate project-specific instructions from the neutral protocol:

```bash
zharwing-memory agent-instructions --project <project-id> --agent generic
zharwing-memory agent-instructions --project <project-id> --agent codex --output AGENTS.md
zharwing-memory agent-instructions --project <project-id> --agent claude --output CLAUDE.md
zharwing-memory agent-instructions --project <project-id> --agent qwen --output QWEN.md
```

Generated files are adapters. They are not the source of truth.
