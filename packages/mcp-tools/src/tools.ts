export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
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
export const MEMORY_TOOLS: McpToolDefinition[] = [
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
  tool("memory.start_session", "Start a fresh project-scoped work session.", {
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
    maxTokens: { type: "number", minimum: 1 },
    idempotencyKey: { type: "string" }
  }, ["projectId"]),
  tool("memory.get_context_bundle", "Generate and persist a relevant project memory bundle.", {
    projectId: { type: "string" },
    sessionId: { type: "string" },
    taskText: { type: "string" },
    requestedBy: { type: "string" },
    maxTokens: { type: "number", minimum: 1 },
    idempotencyKey: { type: "string" }
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
      required
    },
    rpcMethod: name
  };
}
