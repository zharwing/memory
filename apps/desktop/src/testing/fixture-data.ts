import type { OperationName, OperationOutput, Session } from "@zharwing/memory-core";

export const FIXTURE_PROJECT_ID = "scenario-project-saffron";
export const FIXTURE_NOW = "2031-04-05T12:00:00.000Z";
export const SYNTHETIC_PRIVACY_CANARY = "ZHARWING_FRONTEND_SYNTHETIC_CANARY_DO_NOT_SHIP_7F6C";

export const fixtureProject = {
  id: FIXTURE_PROJECT_ID,
  visibility: "ai-eligible",
  name: "Saffron Memory Studio",
  slug: "saffron-memory-studio",
  memoryRoot: "synthetic-fixtures/memory/scenario-project-saffron",
  repos: [{
    path: "synthetic-fixtures/repos/saffron-ui",
    name: "Saffron UI",
    description: "Fictional frontend used by production-composed scenarios.",
    role: "app",
    defaultBranch: "main",
    visibility: "ai-eligible",
    created: FIXTURE_NOW,
    updated: FIXTURE_NOW
  }],
  created: FIXTURE_NOW,
  updated: FIXTURE_NOW,
  lastOpened: FIXTURE_NOW,
  privacyPolicy: {
    defaultVisibility: "review-required",
    ignorePatterns: ["synthetic-fixtures/ignored/**"],
    neverSendPatterns: ["synthetic-fixtures/never-send/**"],
    redactSecrets: true,
    blockOnHighRiskSecrets: true,
    allowCrossProjectContext: false,
    requireApprovalBeforeServingContext: true
  },
  contextPolicy: {
    directSessionInclusionDays: 7,
    summaryOnlyDays: 30,
    maxRawSessions: 5,
    maxSummarizedSessions: 20,
    maxTokens: 8_000,
    includeGlobalPreferences: false,
    startupMode: "ask-when-opening-project",
    allowLastOpenedProjectFallback: false,
    allowAllProjectSearch: false
  },
  assistantPolicy: {
    enabled: false,
    runtimeType: "disabled",
    autoAcceptLowRiskMetadata: false
  },
  memoryWritePolicy: {
    allowAgentDirectWrites: false,
    reviewMode: "all"
  }
} satisfies OperationOutput<"memory.list_projects">[number];

export const fixtureSession = {
  id: "session-saffron-1",
  projectId: FIXTURE_PROJECT_ID,
  status: "active",
  visibility: "review-required",
  taskTitle: "Verify a deliberately long scenario title without truncating recovery controls or hiding the current state",
  goal: "Exercise production store and component boundaries with fictional data.",
  branch: "scenario/fictional-only",
  agent: "scenario-runner",
  client: "node-test",
  started: FIXTURE_NOW,
  updated: FIXTURE_NOW,
  summary: "A fictional session summary.",
  topics: ["testing", "accessibility"],
  nextSteps: ["Review the scenario output"],
  blockers: [],
  touchedFiles: ["synthetic-fixtures/repos/saffron-ui/src/example.ts"],
  checkpointCount: 1,
  totalTouchedFiles: 1,
  workstreamIds: ["workstream-saffron-1"],
  includeInGraph: true,
  revision: "fixture-revision-1"
} satisfies OperationOutput<"memory.list_project_sessions">[number];

export const fixtureSessionRecord = {
  id: fixtureSession.id,
  projectId: FIXTURE_PROJECT_ID,
  repoPath: "synthetic-fixtures/repos/saffron-ui",
  workingDirectory: "synthetic-fixtures/repos/saffron-ui",
  branch: fixtureSession.branch,
  agent: fixtureSession.agent,
  client: fixtureSession.client,
  status: fixtureSession.status,
  visibility: fixtureSession.visibility,
  started: fixtureSession.started,
  updated: fixtureSession.updated,
  taskTitle: fixtureSession.taskTitle,
  includeInGraph: fixtureSession.includeInGraph,
  goal: fixtureSession.goal,
  summary: fixtureSession.summary,
  topics: fixtureSession.topics,
  nextSteps: fixtureSession.nextSteps,
  blockers: fixtureSession.blockers,
  touchedFiles: fixtureSession.touchedFiles,
  workstreamIds: fixtureSession.workstreamIds,
  relatedDocs: ["document-saffron-1"],
  relatedTasks: [],
  checkpoints: [{
    id: "checkpoint-saffron-1",
    created: FIXTURE_NOW,
    summary: "Fictional checkpoint.",
    nextSteps: fixtureSession.nextSteps,
    blockers: [],
    touchedFiles: fixtureSession.touchedFiles,
    proposedUpdateIds: [],
    visibility: "review-required"
  }],
  filePath: "synthetic-fixtures/sessions/session-saffron-1.md",
  body: "# Fictional work log",
  stateSemanticsVersion: 2
} satisfies Session;

export const fixtureDocument = {
  id: "document-saffron-1",
  projectId: FIXTURE_PROJECT_ID,
  title: "Fictional architecture note with a long descriptive label for reflow evidence",
  type: "architecture-note",
  status: "active",
  visibility: "ai-eligible",
  topics: ["architecture", "frontend"],
  workstreamIds: ["workstream-saffron-1"],
  relatedTasks: [],
  relatedFiles: ["synthetic-fixtures/repos/saffron-ui/src/example.ts"],
  relatedSessions: [fixtureSession.id],
  relatedDiagrams: [],
  created: FIXTURE_NOW,
  updated: FIXTURE_NOW,
  confidence: "high",
  filePath: "synthetic-fixtures/docs/architecture-note.md",
  body: "# Fictional architecture note\n\nNo production or private data is used."
} satisfies OperationOutput<"memory.list_docs">[number];

export const fixtureWorkstream = {
  id: "workstream-saffron-1",
  projectId: FIXTURE_PROJECT_ID,
  name: "Frontend qualification",
  slug: "frontend-qualification",
  status: "active",
  visibility: "review-required",
  summary: "Fictional multi-day qualification work.",
  goal: "Keep scenario evidence separate from production data.",
  topics: ["testing"],
  repoRoles: ["app"],
  relatedTasks: [],
  relatedFiles: [],
  pinnedDocIds: [fixtureDocument.id],
  created: FIXTURE_NOW,
  updated: FIXTURE_NOW,
  filePath: "synthetic-fixtures/workstreams/frontend-qualification.md",
  body: "# Frontend qualification"
} satisfies OperationOutput<"memory.list_workstreams">[number];

export const fixtureInboxProposal = {
  id: "proposal-saffron-1",
  projectId: FIXTURE_PROJECT_ID,
  type: "doc-update",
  status: "pending",
  visibility: "review-required",
  sourceSession: fixtureSession.id,
  sourceAgent: "scenario-runner",
  sourceKind: "manual",
  created: FIXTURE_NOW,
  confidence: "medium",
  affectedFiles: ["synthetic-fixtures/docs/architecture-note.md"],
  targetDocument: fixtureDocument.id,
  proposedPatch: "Fictional proposal body.",
  reason: "Exercise the review-required state."
} satisfies OperationOutput<"memory.list_inbox">[number];

export const fixtureSemanticSettings = {
  version: 1,
  enabled: true,
  mode: "review",
  providerId: "fixture-provider",
  providerKind: "manual",
  model: "fixture-model",
  autoAcceptThreshold: 0.96,
  reviewThreshold: 0.72,
  discardBelowThreshold: 0.4,
  maxCandidatesPerDocument: 12,
  maxClusterSize: 20,
  includeDeterministicSignals: true,
  includeVectorCandidates: false,
  remoteProvidersEnabled: false,
  updated: FIXTURE_NOW
} satisfies OperationOutput<"memory.get_semantic_graph_settings">;

export const fixtureGraph = {
  projectId: FIXTURE_PROJECT_ID,
  visibility: "review-required",
  generated: FIXTURE_NOW,
  nodes: [
    { id: `project:${FIXTURE_PROJECT_ID}`, projectId: FIXTURE_PROJECT_ID, type: "project", label: fixtureProject.name, visibility: "ai-eligible" },
    { id: `doc:${fixtureDocument.id}`, projectId: FIXTURE_PROJECT_ID, type: "doc", label: fixtureDocument.title, visibility: "ai-eligible", path: fixtureDocument.filePath }
  ],
  edges: [{
    id: "edge-saffron-1",
    projectId: FIXTURE_PROJECT_ID,
    from: `project:${FIXTURE_PROJECT_ID}`,
    to: `doc:${fixtureDocument.id}`,
    type: "contains",
    visibility: "ai-eligible",
    reason: "The fictional document belongs to the fictional project.",
    sourceKind: "deterministic"
  }]
} satisfies OperationOutput<"memory.get_graph">;

export const fixtureContextBundle = {
  id: "context-saffron-1",
  projectId: FIXTURE_PROJECT_ID,
  visibility: "review-required",
  created: FIXTURE_NOW,
  requestedBy: "desktop",
  includedItems: [{
    id: fixtureDocument.id,
    projectId: FIXTURE_PROJECT_ID,
    type: "document",
    title: fixtureDocument.title,
    sourcePath: fixtureDocument.filePath,
    visibility: "ai-eligible",
    lastUpdated: FIXTURE_NOW,
    reason: "Fictional scenario inclusion.",
    mode: "summary",
    content: "Safe fictional summary with no private or credential material.",
    tokenEstimate: 12
  }],
  excludedItems: [{
    id: "excluded-never-send-1",
    projectId: FIXTURE_PROJECT_ID,
    type: "document",
    title: "Never-send fictional item",
    sourcePath: "synthetic-fixtures/never-send/excluded.md",
    reason: "never-send"
  }],
  redactions: [],
  tokenEstimate: 12,
  safetyStatus: "clean",
  markdown: "# Safe fictional context\n\nNo excluded content is present."
} satisfies OperationOutput<"memory.preview_context_bundle">;

export const fixtureLargeGraph: OperationOutput<"memory.get_graph"> = {
  projectId: FIXTURE_PROJECT_ID,
  visibility: "review-required",
  generated: FIXTURE_NOW,
  nodes: Array.from({ length: 600 }, (_, index) => ({
    id: `doc:large-${index}`,
    projectId: FIXTURE_PROJECT_ID,
    type: "doc" as const,
    label: `Fictional graph document ${index + 1}`,
    visibility: "ai-eligible" as const,
    path: `synthetic-fixtures/docs/large-${index}.md`
  })),
  edges: Array.from({ length: 599 }, (_, index) => ({
    id: `edge:large-${index}`,
    projectId: FIXTURE_PROJECT_ID,
    from: `doc:large-${index}`,
    to: `doc:large-${index + 1}`,
    type: "related" as const,
    visibility: "ai-eligible" as const,
    reason: "Synthetic scale relationship.",
    sourceKind: "deterministic" as const
  }))
};

export function populatedOperationResults(options: { large?: boolean; omitOptional?: boolean } = {}):
Readonly<Partial<Record<OperationName, unknown>>> {
  const documents = options.large
    ? Array.from({ length: 500 }, (_, index) => ({
        ...fixtureDocument,
        id: `document-large-${index}`,
        title: `Fictional document ${index + 1}`,
        filePath: `synthetic-fixtures/docs/document-${index}.md`
      }))
    : [fixtureDocument];
  const project = options.omitOptional
    ? { ...fixtureProject, lastOpened: undefined, repos: [] }
    : fixtureProject;
  return Object.freeze({
    "memory.health": { status: "ok", memoryRoot: "synthetic-fixtures/memory" },
    "memory.list_projects": [project],
    "memory.get_project_summary": {
      visibility: "review-required",
      project,
      latestSession: options.omitOptional ? undefined : fixtureSessionRecord,
      activeSession: options.omitOptional ? undefined : fixtureSessionRecord,
      counts: { sessions: 1, documents: documents.length, workstreams: 1, diagrams: 0, pendingInbox: 1, warnings: 0 },
      warnings: []
    },
    "memory.list_project_repos": project.repos,
    "memory.list_project_sessions": options.large
      ? Array.from({ length: 200 }, (_, index) => ({ ...fixtureSession, id: `session-large-${index}`, taskTitle: `Fictional session ${index + 1}`, revision: `fixture-revision-${index}` }))
      : [fixtureSession],
    "memory.list_docs": documents,
    "memory.list_workstreams": [fixtureWorkstream],
    "memory.list_inbox": [fixtureInboxProposal],
    "memory.get_graph": options.large ? fixtureLargeGraph : fixtureGraph,
    "memory.get_semantic_graph_settings": fixtureSemanticSettings,
    "memory.get_semantic_graph_status": {
      projectId: FIXTURE_PROJECT_ID,
      visibility: "review-required",
      settings: fixtureSemanticSettings,
      edgeCounts: { accepted: 0, proposed: 0 },
      runCounts: { total: 0 },
      updated: FIXTURE_NOW
    },
    "memory.list_semantic_edges": [],
    "memory.list_semantic_graph_runs": [],
    "memory.assistant_status": {
      available: false,
      state: "off",
      runtimeType: "disabled",
      message: "Assistant is disabled in this fictional scenario.",
      jobsAvailable: [],
      recommendedModels: []
    },
    "memory.get_provider_secret_status": {
      configured: false,
      providerKind: "openai",
      revision: null,
      updatedAt: null
    },
    "memory.preview_context_bundle": fixtureContextBundle,
    "memory.list_backups": []
  });
}
