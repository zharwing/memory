import { AGENT_OPERATIONS } from "@zharwing/memory-core";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
  rpcMethod: string;
}

/**
 * The complete Codex/agent MCP surface.
 *
 * Zharwing Memory is AI-visible by default inside the selected project. Keep
 * this list focused on the daily memory loop and do not advertise daemon
 * control-plane operations that the agent endpoint will reject.
 */
const CONFIGURED_MEMORY_TOOLS: McpToolDefinition[] = [
  tool("memory.health", "Check that the local Zharwing Memory service is available.", {}),
  tool("memory.get_startup_state", "Resolve the current project and return compact carry-forward summaries plus open workstreams. Call once per work round; pass knownRevision only for a justified refresh.", {
    workingDirectory: { type: "string" },
    projectId: { type: "string" },
    clientName: { type: "string" },
    knownRevision: { type: "string" }
  }),
  tool("memory.get_latest_session", "Read a compact summary of the latest session in the selected project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.get_recent_sessions", "Read compact summaries of recent sessions in the selected project.", {
    projectId: { type: "string" },
    limit: { type: "number", minimum: 1, maximum: 200 }
  }, ["projectId"]),
  tool("memory.get_session_detail", "Read explicitly requested session body or paginated checkpoint history.", {
    projectId: { type: "string" },
    sessionId: { type: "string" },
    sections: {
      type: "array",
      items: { type: "string", enum: ["body", "checkpoints"] }
    },
    checkpointLimit: { type: "number", minimum: 1, maximum: 100 },
    cursor: { type: "string" }
  }, ["projectId", "sessionId"]),
  tool("memory.start_session", "Start a fresh project-scoped work session. Sessions still active from an earlier day are closed automatically first.", {
    projectId: { type: "string" },
    taskTitle: { type: "string" },
    goal: { type: "string" },
    repoPath: { type: "string" },
    workingDirectory: { type: "string" },
    branch: { type: "string" },
    agent: { type: "string" },
    client: { type: "string" },
    workstreamIds: { type: "array", items: { type: "string" } }
  }, ["projectId"]),
  tool("memory.search", "Search AI-visible memory inside one selected project.", {
    projectId: { type: "string" },
    query: { type: "string" }
  }, ["projectId", "query"]),
  tool("memory.preview_context_bundle", "Preview relevant project memory without persisting a bundle.", {
    projectId: { type: "string" },
    sessionId: { type: "string" },
    taskText: { type: "string" },
    requestedBy: { type: "string" },
    maxTokens: { type: "number", minimum: 1 }
  }, ["projectId"]),
  tool("memory.get_context_bundle", "Generate and persist a relevant project memory bundle.", {
    projectId: { type: "string" },
    sessionId: { type: "string" },
    taskText: { type: "string" },
    requestedBy: { type: "string" },
    maxTokens: { type: "number", minimum: 1 }
  }, ["projectId"]),
  tool("memory.save_checkpoint", "Save progress, touched files, blockers, and next steps to a session.", {
    projectId: { type: "string" },
    sessionId: { type: "string" },
    summary: { type: "string" },
    nextSteps: { type: "array", items: { type: "string" } },
    blockers: { type: "array", items: { type: "string" } },
    touchedFiles: { type: "array", items: { type: "string" } },
    proposedUpdateIds: { type: "array", items: { type: "string" } },
    workstreamIds: { type: "array", items: { type: "string" } }
  }, ["projectId", "sessionId", "summary"]),
  tool("memory.close_session", "Close a session with its outcome and concrete next steps.", {
    projectId: { type: "string" },
    sessionId: { type: "string" },
    summary: { type: "string" },
    nextSteps: { type: "array", items: { type: "string" } },
    blockers: { type: "array", items: { type: "string" } },
    workstreamIds: { type: "array", items: { type: "string" } },
    autoSummarize: { type: "boolean" }
  }, ["projectId", "sessionId"])
];

const configuredByOperation = new Map(
  CONFIGURED_MEMORY_TOOLS.map((definition) => [definition.rpcMethod, definition] as const)
);
const registeredAgentOperations = new Set<string>(AGENT_OPERATIONS);

/**
 * The operation registry is the authority for the production agent surface;
 * this module contributes only MCP descriptions and JSON Schema presentation.
 */
export const MEMORY_TOOLS: readonly McpToolDefinition[] = Object.freeze(
  CONFIGURED_MEMORY_TOOLS
    .filter((definition) => registeredAgentOperations.has(definition.rpcMethod))
    .map((definition) => Object.freeze(definition))
);

if (
  configuredByOperation.size !== AGENT_OPERATIONS.length ||
  AGENT_OPERATIONS.some((operation) => !configuredByOperation.has(operation))
) {
  throw new Error("The agent tool presentation registry does not match the operation registry.");
}

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required?: string[]
): McpToolDefinition {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
      additionalProperties: false
    },
    rpcMethod: name
  };
}
