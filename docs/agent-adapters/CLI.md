# CLI Adapter

Use this adapter when an agent can run local shell commands but does not have MCP
tools for AI Memory.

## Startup

```bash
aimem detect <working-directory>
aimem status --project <project-id>
aimem resume --project <project-id>
aimem search --project <project-id> "<task, feature, error, or file>"
```

Start a session when the work is meaningful:

```bash
aimem start "<task title>" --project <project-id> --agent <agent-name>
```

Attach a known workstream when appropriate:

```bash
aimem start "<task title>" --project <project-id> --agent <agent-name> --workstream <workstream-id>
```

## Context

Preview context before using it in a prompt:

```bash
aimem context --project <project-id> --preview --task "<task>"
```

Persist the bundle when it is actually used:

```bash
aimem context --project <project-id> --session <session-id> --task "<task>"
```

## Progress

```bash
aimem checkpoint --project <project-id> --session <session-id> "summary" \
  --next "next step" \
  --file "path/to/file"
```

Close when the work round is done:

```bash
aimem close --project <project-id> --session <session-id> "summary" \
  --next "next step"
```

## Agent Instructions

Generate project-specific instructions from the neutral protocol:

```bash
aimem agent-instructions --project <project-id> --agent generic
aimem agent-instructions --project <project-id> --agent codex --output AGENTS.md
aimem agent-instructions --project <project-id> --agent claude --output CLAUDE.md
aimem agent-instructions --project <project-id> --agent qwen --output QWEN.md
```

Generated files are adapters. They are not the source of truth.
