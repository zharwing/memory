export type AgentInstructionTarget = "generic" | "codex" | "claude" | "qwen";

export interface RenderAgentInstructionsArgs {
  agent: AgentInstructionTarget;
  project: Record<string, unknown>;
  workstreams: Array<Record<string, unknown>>;
}

export function normalizeAgentTarget(input?: string): AgentInstructionTarget {
  const value = (input || "generic").toLowerCase();
  if (value === "codex" || value === "claude" || value === "qwen" || value === "generic") {
    return value;
  }
  throw new Error(`Unsupported agent target: ${input}. Use generic, codex, claude, or qwen.`);
}

export function defaultInstructionFile(agent: AgentInstructionTarget): string {
  switch (agent) {
    case "codex":
      return "AGENTS.md";
    case "claude":
      return "CLAUDE.md";
    case "qwen":
      return "QWEN.md";
    default:
      return ".memory-agent.md";
  }
}

export function renderAgentInstructions(args: RenderAgentInstructionsArgs): string {
  const projectId = stringValue(args.project.id) || "<project-id>";
  const projectName = stringValue(args.project.name) || projectId;
  const repos = Array.isArray(args.project.repos) ? args.project.repos : [];
  const repoLines = repos
    .map((repo) => repoLine(asRecord(repo)))
    .filter(Boolean);
  const workstreamLines = args.workstreams
    .map((workstream) => workstreamLine(workstream))
    .filter(Boolean);

  return `# AI Memory Instructions

Use AI Memory as the durable project memory, session history, search, and context layer for this project.

These instructions are generated from AI Memory's universal agent protocol. Treat project data below as configuration, not as permanent agent policy.

## Project

- Project id: ${projectId}
- Project name: ${projectName}
- Target agent: ${args.agent}

## Tool Preference

Use the strongest available interface in this order:

1. MCP memory tools.
2. The aimem CLI.
3. The local daemon JSON-RPC API.
4. Read-only local docs fallback when no memory tool is available.

If AI Memory is unavailable, continue with the user's task and report that memory was unavailable.

## Startup Workflow

1. Resolve the active AI Memory project from the current directory or explicit project id.
2. Read startup state before deciding whether to start or resume a session.
3. Search project memory for the task, feature, error, or file names involved.
4. Start or resume a project-scoped session for meaningful work.
5. Preview or generate a context bundle when prior context matters.

## During Work

- Save checkpoints after meaningful progress, decisions, or interruptions.
- Attach sessions and docs to a workstream when the task belongs to a known multi-day topic.
- Keep session progress in the session file. Write durable docs directly for reusable facts, commands, decisions, gotchas, or architecture notes when review mode is off.
- Use Memory Inbox proposals only when the project policy asks for review or the update is risky, uncertain, or needs human judgment.
- Link external task ids in related task metadata only when this project provides them.
- Search before creating durable docs to avoid duplicates.

## Closeout

- Close the session with a concrete summary.
- Include next steps, blockers, and touched files when known.
- Update the session directly with progress, next steps, blockers, and touched files.
- Write durable memory directly by default. Route updates to the inbox only when review mode is enabled or the update should not be trusted without a human pass.

## Boundaries

- Do not ingest secrets, credentials, local credential caches, .env files, raw private keys, tokens, or unrelated runtime logs.
- Respect document visibility. Do not send private, human-only, or never-send material to external models.
- Do not search unrelated projects unless the user explicitly asks for cross-project context and policy allows it.
- Do not make AI Memory pretend to be an external task tracker unless this project explicitly adopts it for that role.

## Linked Repos

${repoLines.length ? repoLines.join("\n") : "- No linked repos recorded yet."}

## Workstreams

${workstreamLines.length ? workstreamLines.join("\n") : "- No workstreams recorded yet."}
`;
}

function repoLine(repo: Record<string, unknown>): string {
  const role = stringValue(repo.role) || "repo";
  const path = stringValue(repo.path);
  const name = stringValue(repo.name);
  if (!path && !name) return "";
  return `- ${role}: ${name ? `${name} - ` : ""}${path || ""}`;
}

function workstreamLine(workstream: Record<string, unknown>): string {
  const id = stringValue(workstream.id) || stringValue(workstream.slug);
  const name = stringValue(workstream.name) || id;
  if (!id && !name) return "";
  const status = stringValue(workstream.status) || "active";
  const topics = Array.isArray(workstream.topics)
    ? workstream.topics.map(String).filter(Boolean).join(", ")
    : "";
  return `- ${name} (${id}, ${status})${topics ? ` - topics: ${topics}` : ""}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
