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
  tool("memory.delete_project", "Move a project memory workspace to trash and unregister it from active projects.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.get_project_summary", "Get current project summary and health.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.update_memory_write_policy", "Update whether agents write memory directly or route updates through review.", {
    projectId: { type: "string" },
    allowAgentDirectWrites: { type: "boolean" },
    reviewMode: { type: "string", enum: ["off", "risky-only", "all"] }
  }, ["projectId"]),
  tool("memory.update_assistant_policy", "Update the project's local assistant provider settings.", {
    projectId: { type: "string" },
    enabled: { type: "boolean" },
    runtimeType: {
      type: "string",
      enum: ["disabled", "app-managed-llamacpp", "ollama", "lm-studio", "custom-openai-compatible"]
    },
    modelName: { type: "string" },
    modelPath: { type: "string" },
    endpoint: { type: "string" },
    autoAcceptLowRiskMetadata: { type: "boolean" },
    policy: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        runtimeType: {
          type: "string",
          enum: ["disabled", "app-managed-llamacpp", "ollama", "lm-studio", "custom-openai-compatible"]
        },
        modelName: { type: "string" },
        modelPath: { type: "string" },
        endpoint: { type: "string" },
        autoAcceptLowRiskMetadata: { type: "boolean" }
      }
    }
  }, ["projectId"]),
  tool("memory.update_graph_rules", "Replace the project's deterministic graph extraction rules.", {
    projectId: { type: "string" },
    graphRules: {
      type: "array",
      items: {
        type: "object",
        properties: {
          match: { type: "string" },
          nodeType: { type: "string", enum: ["topic", "service", "package", "diagram-group", "code-area", "external-reference"] },
          label: { type: "string" },
          segment: { type: "number" },
          slugFromSegment: { type: "number" },
          labelFromSegment: { type: "number" },
          edgeType: { type: "string", enum: ["supports", "explains", "mentions", "uses", "contains", "depends-on", "related"] },
          topic: { type: "string" }
        },
        required: ["match", "nodeType"]
      }
    }
  }, ["projectId", "graphRules"]),
  tool("memory.list_project_repos", "List repos and worktrees linked to a project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.link_repo", "Link a repo or worktree path to a project and optionally write a pointer file.", {
    projectId: { type: "string" },
    repoPath: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    role: { type: "string" },
    defaultBranch: { type: "string" },
    writePointerFile: { type: "boolean" }
  }, ["projectId", "repoPath"]),
  tool("memory.unlink_repo", "Unlink a repo or worktree path from a project and optionally remove its pointer file.", {
    projectId: { type: "string" },
    repoPath: { type: "string" },
    removePointerFile: { type: "boolean" }
  }, ["projectId", "repoPath"]),
  tool("memory.delete_repo", "Move a linked repo entry to trash and remove it from the active project.", {
    projectId: { type: "string" },
    repoPath: { type: "string" },
    removePointerFile: { type: "boolean" }
  }, ["projectId", "repoPath"]),
  tool("memory.list_workstreams", "List multi-day workstreams for a project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.create_workstream", "Create a project-scoped workstream for a multi-day topic or epic.", {
    projectId: { type: "string" },
    name: { type: "string" },
    summary: { type: "string" },
    goal: { type: "string" },
    topics: { type: "array", items: { type: "string" } },
    repoRoles: { type: "array", items: { type: "string" } },
    relatedTasks: { type: "array", items: { type: "string" } },
    relatedFiles: { type: "array", items: { type: "string" } }
  }, ["projectId", "name"]),
  tool("memory.get_workstream_detail", "Get a workstream plus related sessions and documents.", {
    projectId: { type: "string" },
    workstreamId: { type: "string" }
  }, ["projectId", "workstreamId"]),
  tool("memory.update_workstream_status", "Update a workstream status.", {
    projectId: { type: "string" },
    workstreamId: { type: "string" },
    status: { type: "string", enum: ["active", "paused", "done", "archived"] }
  }, ["projectId", "workstreamId", "status"]),
  tool("memory.delete_workstream", "Move a workstream to trash.", {
    projectId: { type: "string" },
    workstreamId: { type: "string" }
  }, ["projectId", "workstreamId"]),
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
    client: { type: "string" },
    workstreamIds: { type: "array", items: { type: "string" } }
  }, ["projectId"]),
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
  tool("memory.delete_session", "Move a session to trash.", {
    projectId: { type: "string" },
    sessionId: { type: "string" }
  }, ["projectId", "sessionId"]),
  tool("memory.search", "Keyword search scoped to one project by default.", {
    projectId: { type: "string" },
    query: { type: "string" }
  }, ["projectId", "query"]),
  tool("memory.create_doc", "Create a project memory document directly. This is the default path when review mode is off.", {
    projectId: { type: "string" },
    title: { type: "string" },
    type: { type: "string" },
    body: { type: "string" },
    status: { type: "string" },
    visibility: { type: "string" }
  }, ["projectId", "title", "type", "body"]),
  tool("memory.update_doc", "Update an existing project memory document body or title.", {
    projectId: { type: "string" },
    documentId: { type: "string" },
    title: { type: "string" },
    body: { type: "string" }
  }, ["projectId", "documentId"]),
  tool("memory.delete_doc", "Move a project document to trash.", {
    projectId: { type: "string" },
    documentId: { type: "string" }
  }, ["projectId", "documentId"]),
  tool("memory.list_import_profiles", "List built-in folder import profiles.", {}),
  tool("memory.prepare_import", "Scan a source folder and return a reviewable import plan without writing files.", {
    projectId: { type: "string" },
    sourceRoot: { type: "string" },
    profile: {
      oneOf: [
        { type: "string" },
        { type: "object" }
      ]
    },
    limit: { type: "number" }
  }, ["projectId", "sourceRoot"]),
  tool("memory.commit_import", "Commit a prepared import plan or scan-and-import a source folder.", {
    projectId: { type: "string" },
    plan: { type: "object" },
    sourceRoot: { type: "string" },
    profile: {
      oneOf: [
        { type: "string" },
        { type: "object" }
      ]
    },
    conflictStrategy: { type: "string", enum: ["skip", "overwrite", "duplicate"] },
    limit: { type: "number" }
  }, ["projectId"]),
  tool("memory.propose_memory_update", "Create a Memory Inbox proposal when project policy or update risk calls for review.", {
    projectId: { type: "string" },
    type: { type: "string" },
    sourceKind: { type: "string" },
    proposedPatch: { type: "string" },
    reason: { type: "string" }
  }, ["projectId", "type", "sourceKind", "proposedPatch", "reason"]),
  tool("memory.propose_graph_update", "Create a Memory Inbox proposal for AI-suggested graph rules or graph relationship changes.", {
    projectId: { type: "string" },
    sourceSession: { type: "string" },
    sourceAgent: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    affectedFiles: { type: "array", items: { type: "string" } },
    proposedPatch: { type: "string" },
    reason: { type: "string" }
  }, ["projectId", "proposedPatch", "reason"]),
  tool("memory.list_inbox", "List Memory Inbox proposals for a project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.update_inbox_status", "Mark a Memory Inbox proposal as accepted, rejected, deferred, or edited.", {
    projectId: { type: "string" },
    proposalId: { type: "string" },
    status: { type: "string", enum: ["pending", "accepted", "rejected", "deferred", "edited"] },
    editedPatch: { type: "string" }
  }, ["projectId", "proposalId", "status"]),
  tool("memory.delete_inbox_item", "Move a Memory Inbox proposal to trash.", {
    projectId: { type: "string" },
    proposalId: { type: "string" }
  }, ["projectId", "proposalId"]),
  tool("memory.get_graph", "Get derived graph for the current project.", {
    projectId: { type: "string" },
    includeSemantic: { type: "string", enum: ["none", "accepted", "all"] },
    includeSemanticProposals: { type: "boolean" }
  }, ["projectId"]),
  tool("memory.get_semantic_graph_settings", "Get semantic graph settings for a project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.update_semantic_graph_settings", "Update semantic graph settings for a project.", {
    projectId: { type: "string" },
    settings: { type: "object" }
  }, ["projectId", "settings"]),
  tool("memory.get_semantic_graph_status", "Get semantic graph edge and run counts for a project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.list_semantic_edges", "List durable semantic graph edges for a project.", {
    projectId: { type: "string" },
    status: {
      oneOf: [
        { type: "string", enum: ["proposed", "accepted", "rejected", "auto-accepted"] },
        { type: "array", items: { type: "string", enum: ["proposed", "accepted", "rejected", "auto-accepted"] } }
      ]
    }
  }, ["projectId"]),
  tool("memory.update_semantic_edge_status", "Bulk update durable semantic graph edge status.", {
    projectId: { type: "string" },
    edgeIds: { type: "array", items: { type: "string" } },
    status: { type: "string", enum: ["proposed", "accepted", "rejected", "auto-accepted"] }
  }, ["projectId", "edgeIds", "status"]),
  tool("memory.list_semantic_graph_runs", "List semantic graph analysis runs for a project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.get_semantic_graph_run", "Get one semantic graph analysis run.", {
    projectId: { type: "string" },
    runId: { type: "string" }
  }, ["projectId", "runId"]),
  tool("memory.preview_semantic_graph_analysis", "Build a privacy-gated semantic graph extraction plan and deterministic candidate index without calling an LLM.", {
    projectId: { type: "string" },
    maxDocumentChars: { type: "number" },
    persistCandidateIndex: { type: "boolean" },
    scope: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["all-docs", "changed-docs", "selected-docs", "focused-graph-node", "workstream", "repo"] },
        documentIds: { type: "array", items: { type: "string" } },
        nodeId: { type: "string" },
        workstreamId: { type: "string" },
        repoPath: { type: "string" }
      }
    }
  }, ["projectId"]),
  tool("memory.analyze_semantic_graph", "Run LLM-assisted semantic graph analysis with per-document extraction, candidate judging, and review/auto policy.", {
    projectId: { type: "string" },
    mode: { type: "string", enum: ["review", "auto", "dry-run"] },
    dryRun: { type: "boolean" },
    endpoint: { type: "string" },
    model: { type: "string" },
    apiKey: { type: "string" },
    providerId: { type: "string" },
    providerKind: { type: "string" },
    sourceAgent: { type: "string" },
    timeoutMs: { type: "number" },
    maxOutputTokens: { type: "number" },
    jsonMode: { type: "boolean" },
    maxDocumentChars: { type: "number" },
    maxDocuments: { type: "number" },
    maxCandidates: { type: "number" },
    maxCandidatesPerDocument: { type: "number" },
    autoAcceptThreshold: { type: "number" },
    reviewThreshold: { type: "number" },
    discardBelowThreshold: { type: "number" },
    persistCandidateIndex: { type: "boolean" },
    scope: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["all-docs", "changed-docs", "selected-docs", "focused-graph-node", "workstream", "repo"] },
        documentIds: { type: "array", items: { type: "string" } },
        nodeId: { type: "string" },
        workstreamId: { type: "string" },
        repoPath: { type: "string" }
      }
    }
  }, ["projectId"]),
  tool("memory.check_semantic_graph_provider", "Check an OpenAI-compatible semantic graph provider by requesting a tiny JSON response.", {
    projectId: { type: "string" },
    endpoint: { type: "string" },
    model: { type: "string" },
    apiKey: { type: "string" },
    timeoutMs: { type: "number" },
    maxOutputTokens: { type: "number" },
    jsonMode: { type: "boolean" }
  }, ["projectId"]),
  tool("memory.propose_semantic_edges", "Create a Memory Inbox proposal from structured semantic graph relationship edges.", {
    projectId: { type: "string" },
    runId: { type: "string" },
    sourceAgent: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    affectedFiles: { type: "array", items: { type: "string" } },
    reason: { type: "string" },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          type: {
            type: "string",
            enum: [
              "works-on",
              "touched",
              "referenced",
              "produced",
              "affects",
              "supersedes",
              "supports",
              "explains",
              "mentions",
              "uses",
              "contains",
              "depends-on",
              "blocked-by",
              "belongs-to",
              "related",
              "duplicates",
              "contradicts"
            ]
          },
          confidence: { type: "number" },
          reason: { type: "string" },
          evidence: {
            type: "array",
            items: {
              oneOf: [
                { type: "string" },
                {
                  type: "object",
                  properties: {
                    documentId: { type: "string" },
                    quote: { type: "string" },
                    location: { type: "string" },
                    sourcePath: { type: "string" }
                  },
                  required: ["quote"]
                }
              ]
            }
          }
        },
        required: ["from", "to", "type", "confidence", "reason"]
      }
    }
  }, ["projectId", "edges"]),
  tool("memory.accept_semantic_edges_proposal", "Accept a semantic graph Inbox proposal and write its edges to durable semantic graph storage.", {
    projectId: { type: "string" },
    proposalId: { type: "string" },
    status: { type: "string", enum: ["accepted", "auto-accepted"] }
  }, ["projectId", "proposalId"]),
  tool("memory.backup_project", "Create a local snapshot backup for a project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.list_backups", "List local snapshot backups for a project.", {
    projectId: { type: "string" }
  }, ["projectId"]),
  tool("memory.delete_backup", "Move a snapshot backup to trash.", {
    projectId: { type: "string" },
    snapshotPath: { type: "string" }
  }, ["projectId", "snapshotPath"]),
  tool("memory.list_trash", "List deleted items that can be restored or permanently purged.", {}),
  tool("memory.restore_trash_item", "Restore a deleted item from trash.", {
    trashItemId: { type: "string" }
  }, ["trashItemId"]),
  tool("memory.purge_trash_item", "Permanently delete one item from trash.", {
    trashItemId: { type: "string" }
  }, ["trashItemId"]),
  tool("memory.empty_trash", "Permanently delete selected trash items, or all trash items when no ids are supplied.", {
    trashItemIds: { type: "array", items: { type: "string" } }
  }),
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
