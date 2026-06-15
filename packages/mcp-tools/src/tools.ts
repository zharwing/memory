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

export const MEMORY_TOOLS: McpToolDefinition[] = [
  tool("memory.get_startup_state", "Resolve the current project/session and recommended startup action.", {
    workingDirectory: { type: "string" },
    projectId: { type: "string" },
    clientName: { type: "string" }
  }),
  tool("memory.list_projects", "List registered projects with safe metadata.", {}),
  tool("memory.detect_project", "Detect project from a working directory.", {
    workingDirectory: { type: "string" }
  }, ["workingDirectory"]),
  tool("memory.prepare_project_creation", "Preview project creation for an unregistered repo.", {
    workingDirectory: { type: "string" },
    projectName: { type: "string" },
    createPointerFile: { type: "boolean" },
    bootstrapFiles: { type: "array", items: { type: "string" } }
  }, ["workingDirectory"]),
  tool("memory.create_project", "Create a project from a prepared preview request.", {
    preview: { type: "object" }
  }, ["preview"]),
  tool("memory.get_project_summary", "Get current project summary and health.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.get_active_session", "Get active session for a project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.get_latest_session", "Get latest session for a project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.get_recent_sessions", "Get recent sessions for a project.", {
    projectId: { type: "string" },
    limit: { type: "number" }
  }, ["projectId"]),
  tool("memory.list_project_sessions", "List project-scoped sessions.", {
    projectId: { type: "string" },
    limit: { type: "number" }
  }, ["projectId"]),
  tool("memory.start_session", "Start a project-scoped session.", {
    projectId: { type: "string" },
    taskTitle: { type: "string" },
    goal: { type: "string" },
    workingDirectory: { type: "string" },
    branch: { type: "string" },
    agent: { type: "string" },
    client: { type: "string" }
  }, ["projectId", "taskTitle"]),
  tool("memory.start_or_resume_session", "Start or resume a session based on project settings.", {
    projectId: { type: "string" },
    taskTitle: { type: "string" },
    workingDirectory: { type: "string" },
    branch: { type: "string" },
    agent: { type: "string" },
    client: { type: "string" }
  }, ["projectId"]),
  tool("memory.preview_context_bundle", "Preview the AI context bundle without persisting audit files.", {
    projectId: { type: "string" },
    sessionId: { type: "string" },
    taskText: { type: "string" },
    requestedBy: { type: "string" }
  }, ["projectId"]),
  tool("memory.get_context_bundle", "Generate and persist the AI context bundle.", {
    projectId: { type: "string" },
    sessionId: { type: "string" },
    taskText: { type: "string" },
    requestedBy: { type: "string" }
  }, ["projectId"]),
  tool("memory.save_checkpoint", "Save a progress checkpoint to a session.", {
    projectId: { type: "string" },
    sessionId: { type: "string" },
    summary: { type: "string" },
    nextSteps: { type: "array", items: { type: "string" } },
    blockers: { type: "array", items: { type: "string" } },
    touchedFiles: { type: "array", items: { type: "string" } }
  }, ["projectId", "sessionId", "summary"]),
  tool("memory.close_session", "Close a session with final summary and next steps.", {
    projectId: { type: "string" },
    sessionId: { type: "string" },
    summary: { type: "string" },
    nextSteps: { type: "array", items: { type: "string" } }
  }, ["projectId", "sessionId"]),
  tool("memory.search", "Keyword search scoped to one project by default.", {
    projectId: { type: "string" },
    query: { type: "string" }
  }, ["projectId", "query"]),
  tool("memory.create_doc", "Create a project document.", {
    projectId: { type: "string" },
    title: { type: "string" },
    type: { type: "string" },
    body: { type: "string" },
    visibility: { type: "string" }
  }, ["projectId", "title", "type", "body"]),
  tool("memory.propose_memory_update", "Create a reviewable Memory Inbox proposal.", {
    projectId: { type: "string" },
    type: { type: "string" },
    sourceKind: { type: "string" },
    proposedPatch: { type: "string" },
    reason: { type: "string" }
  }, ["projectId", "type", "sourceKind", "proposedPatch", "reason"]),
  tool("memory.list_inbox", "List Memory Inbox proposals for a project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.get_graph", "Get derived graph for the current project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.backup_project", "Create a local snapshot backup for a project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.validate_project", "Validate the project memory workspace.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.rebuild_index", "Rebuild the project search/metadata index from Markdown source files.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.assistant_status", "Get local Memory Assistant status for a project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.summarize_session", "Create a reviewable assistant summary proposal for a session.", {
    projectId: { type: "string" },
    sessionId: { type: "string" }
  }, ["projectId", "sessionId"]),
  tool("memory.prepare_return_summary", "Create a reviewable return-to-project summary proposal.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.classify_imported_doc", "Create a reviewable document classification proposal.", {
    projectId: { type: "string" },
    documentId: { type: "string" }
  }, ["projectId", "documentId"])
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
