import type {
  AssistantPolicy,
  ContextBundle,
  ContextExcludedItem,
  ContextIncludedItem,
  ContextPolicy,
  GraphEdge,
  GraphExtractionRule,
  GraphNode,
  ImportCandidate,
  ImportCommitResult,
  ImportPlan,
  ImportProfile,
  MemoryDocument,
  MemoryWritePolicy,
  PrivacyPolicy,
  Project,
  ProjectCreationPreview,
  ProjectGraph,
  ProposedMemoryUpdate,
  Redaction,
  RepoLink,
  SearchResult,
  SemanticGraphEdge,
  SemanticGraphEvidence,
  SemanticGraphRun,
  SemanticGraphScope,
  SemanticGraphSettings,
  Session,
  SessionCheckpoint,
  SessionDetail,
  SessionSummary,
  StartupState,
  TrashItem,
  Visibility,
  Workstream,
  WorkstreamDetail
} from "../types.js";
import {
  arraySchema,
  booleanSchema,
  enumSchema,
  integerSchema,
  jsonObjectSchema,
  jsonValueSchema,
  literalSchema,
  mapSchema,
  nullSchema,
  nullableSchema,
  numberSchema,
  objectSchema,
  optionalSchema,
  recordSchema,
  stringSchema,
  unionSchema,
  type RuntimeSchema
} from "./runtime-schema.js";

const strings = arraySchema(stringSchema);
const optionalString = optionalSchema(stringSchema);
const optionalBoolean = optionalSchema(booleanSchema);
const optionalNumber = optionalSchema(numberSchema);

export const visibilitySchema = enumSchema([
  "ai-eligible",
  "ai-pinned",
  "review-required",
  "human-only",
  "private",
  "never-send"
]);
export const documentStatusSchema = enumSchema(["draft", "active", "accepted", "superseded", "stale", "archived"]);
const sessionStatusSchema = enumSchema(["active", "closed", "archived"]);
const workstreamStatusSchema = enumSchema(["active", "paused", "done", "archived"]);

export const repoLinkSchema: RuntimeSchema<RepoLink> = objectSchema(
  {
    path: stringSchema,
    name: optionalString,
    description: optionalString,
    role: stringSchema,
    defaultBranch: optionalString,
    visibility: optionalSchema(visibilitySchema),
    created: stringSchema,
    updated: stringSchema
  },
  { unknownKeys: "passthrough" }
);

export const privacyPolicySchema: RuntimeSchema<PrivacyPolicy> = objectSchema(
  {
    defaultVisibility: visibilitySchema,
    ignorePatterns: strings,
    neverSendPatterns: strings,
    redactSecrets: booleanSchema,
    blockOnHighRiskSecrets: booleanSchema,
    allowCrossProjectContext: booleanSchema,
    requireApprovalBeforeServingContext: booleanSchema
  },
  { unknownKeys: "passthrough" }
);

export const contextPolicySchema: RuntimeSchema<ContextPolicy> = objectSchema(
  {
    directSessionInclusionDays: numberSchema,
    summaryOnlyDays: numberSchema,
    maxRawSessions: numberSchema,
    maxSummarizedSessions: numberSchema,
    maxTokens: numberSchema,
    includeGlobalPreferences: booleanSchema,
    startupMode: enumSchema([
      "auto-resume-project-session",
      "ask-when-opening-project",
      "always-start-new-session",
      "manual"
    ]),
    allowLastOpenedProjectFallback: booleanSchema,
    allowAllProjectSearch: booleanSchema
  },
  { unknownKeys: "passthrough" }
);

export const assistantPolicySchema: RuntimeSchema<AssistantPolicy> = objectSchema(
  {
    enabled: booleanSchema,
    runtimeType: enumSchema([
      "app-managed-llamacpp",
      "llama-cpp",
      "ollama",
      "lm-studio",
      "openai",
      "anthropic",
      "custom-openai-compatible",
      "disabled"
    ]),
    modelName: optionalString,
    modelDisplayName: optionalString,
    modelPath: optionalString,
    endpoint: optionalString,
    autoAcceptLowRiskMetadata: booleanSchema
  },
  { unknownKeys: "passthrough" }
);

export const memoryWritePolicySchema: RuntimeSchema<MemoryWritePolicy> = objectSchema(
  {
    allowAgentDirectWrites: booleanSchema,
    reviewMode: enumSchema(["off", "risky-only", "all"])
  },
  { unknownKeys: "passthrough" }
);

export const graphExtractionRuleSchema: RuntimeSchema<GraphExtractionRule> = objectSchema(
  {
    match: stringSchema,
    nodeType: enumSchema(["topic", "service", "package", "diagram-group", "code-area", "external-reference"]),
    label: optionalString,
    segment: optionalNumber,
    slugFromSegment: optionalNumber,
    labelFromSegment: optionalNumber,
    edgeType: optionalSchema(enumSchema(["supports", "explains", "mentions", "uses", "contains", "depends-on", "related"])),
    topic: optionalString
  },
  { unknownKeys: "passthrough" }
);

export const projectSchema: RuntimeSchema<Project> = objectSchema(
  {
    id: stringSchema,
    visibility: optionalSchema(visibilitySchema),
    name: stringSchema,
    slug: stringSchema,
    memoryRoot: stringSchema,
    repos: arraySchema(repoLinkSchema),
    created: stringSchema,
    updated: stringSchema,
    lastOpened: optionalString,
    privacyPolicy: privacyPolicySchema,
    contextPolicy: contextPolicySchema,
    assistantPolicy: assistantPolicySchema,
    memoryWritePolicy: optionalSchema(memoryWritePolicySchema),
    graphRules: optionalSchema(arraySchema(graphExtractionRuleSchema))
  },
  { unknownKeys: "passthrough" }
);

export const sessionCheckpointSchema: RuntimeSchema<SessionCheckpoint> = objectSchema(
  {
    id: stringSchema,
    created: stringSchema,
    summary: stringSchema,
    nextSteps: strings,
    blockers: strings,
    touchedFiles: strings,
    proposedUpdateIds: strings,
    visibility: optionalSchema(visibilitySchema),
    stateFields: optionalSchema(arraySchema(enumSchema(["nextSteps", "blockers"])))
  },
  { unknownKeys: "passthrough" }
);

export const sessionSummarySchema: RuntimeSchema<SessionSummary> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    status: sessionStatusSchema,
    visibility: optionalSchema(visibilitySchema),
    taskTitle: stringSchema,
    goal: optionalString,
    branch: optionalString,
    agent: optionalString,
    client: optionalString,
    started: stringSchema,
    updated: stringSchema,
    closed: optionalString,
    closedReason: optionalString,
    summary: optionalString,
    topics: strings,
    summaryGeneratedAt: optionalString,
    summarySource: optionalSchema(enumSchema(["manual", "assistant", "deterministic", "import"])),
    nextSteps: strings,
    blockers: strings,
    touchedFiles: strings,
    checkpointCount: numberSchema,
    totalTouchedFiles: numberSchema,
    workstreamIds: strings,
    includeInGraph: booleanSchema,
    revision: stringSchema
  },
  { unknownKeys: "passthrough" }
);

export const sessionSchema: RuntimeSchema<Session> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    repoPath: stringSchema,
    workingDirectory: stringSchema,
    branch: optionalString,
    agent: optionalString,
    client: optionalString,
    status: sessionStatusSchema,
    visibility: optionalSchema(visibilitySchema),
    started: stringSchema,
    updated: stringSchema,
    closed: optionalString,
    closedReason: optionalString,
    taskTitle: stringSchema,
    includeInGraph: booleanSchema,
    goal: optionalString,
    summary: optionalString,
    topics: strings,
    summaryGeneratedAt: optionalString,
    summarySource: optionalSchema(enumSchema(["manual", "assistant", "deterministic", "import"])),
    summaryModel: optionalString,
    nextSteps: strings,
    blockers: strings,
    touchedFiles: strings,
    workstreamIds: strings,
    relatedDocs: strings,
    relatedTasks: strings,
    contextBundleId: optionalString,
    checkpoints: arraySchema(sessionCheckpointSchema),
    filePath: optionalString,
    body: optionalString,
    importSourcePath: optionalString,
    importSourceHash: optionalString,
    importedAt: optionalString,
    importProfile: optionalString,
    stateSemanticsVersion: optionalSchema(literalSchema(2))
  },
  { unknownKeys: "passthrough" }
);

export const sessionDetailSchema: RuntimeSchema<SessionDetail> = objectSchema(
  {
    schema: literalSchema("zharwing.memory.session-detail.v1"),
    session: sessionSummarySchema,
    body: optionalString,
    checkpoints: optionalSchema(arraySchema(sessionCheckpointSchema)),
    nextCursor: optionalString
  },
  { unknownKeys: "passthrough" }
);

export const documentTypeSchema = enumSchema([
  "plan",
  "investigation",
  "research",
  "architecture-note",
  "decision-record",
  "architecture-decision-record",
  "design-requirements-document",
  "technical-spec",
  "requirement",
  "user-flow",
  "diagram",
  "command-note",
  "gotcha",
  "meeting-note",
  "external-reference",
  "scratch-note",
  "overview",
  "commands",
  "glossary",
  "privacy"
]);

export const memoryDocumentSchema: RuntimeSchema<MemoryDocument> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    title: stringSchema,
    type: documentTypeSchema,
    status: documentStatusSchema,
    visibility: visibilitySchema,
    topics: strings,
    workstreamIds: strings,
    relatedTasks: strings,
    relatedFiles: strings,
    relatedSessions: strings,
    relatedDiagrams: strings,
    created: stringSchema,
    updated: stringSchema,
    lastVerified: optionalString,
    confidence: optionalSchema(enumSchema(["low", "medium", "high"])),
    filePath: stringSchema,
    body: stringSchema,
    diagramType: optionalString,
    format: optionalSchema(enumSchema(["markdown", "mermaid", "plantuml", "image", "text"])),
    importSourcePath: optionalString,
    importSourceHash: optionalString,
    importedAt: optionalString,
    importProfile: optionalString
  },
  { unknownKeys: "passthrough" }
);

export const workstreamSchema: RuntimeSchema<Workstream> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    name: stringSchema,
    slug: stringSchema,
    status: workstreamStatusSchema,
    visibility: optionalSchema(visibilitySchema),
    summary: optionalString,
    goal: optionalString,
    topics: strings,
    repoRoles: strings,
    relatedTasks: strings,
    relatedFiles: strings,
    pinnedDocIds: strings,
    created: stringSchema,
    updated: stringSchema,
    closed: optionalString,
    filePath: optionalString,
    body: stringSchema
  },
  { unknownKeys: "passthrough" }
);

export const workstreamDetailSchema: RuntimeSchema<WorkstreamDetail> = objectSchema(
  {
    workstream: workstreamSchema,
    sessions: arraySchema(sessionSchema),
    documents: arraySchema(memoryDocumentSchema)
  },
  { unknownKeys: "passthrough" }
);

export const proposedMemoryUpdateSchema: RuntimeSchema<ProposedMemoryUpdate> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    type: enumSchema([
      "decision",
      "command",
      "gotcha",
      "architecture",
      "task",
      "doc-update",
      "stale-warning",
      "diagram",
      "graph-update",
      "session-summary"
    ]),
    status: enumSchema(["pending", "accepted", "rejected", "deferred", "edited"]),
    visibility: optionalSchema(visibilitySchema),
    sourceSession: optionalString,
    sourceAgent: optionalString,
    sourceKind: enumSchema(["external-ai", "memory-assistant", "manual"]),
    created: stringSchema,
    confidence: enumSchema(["low", "medium", "high"]),
    affectedFiles: strings,
    targetDocument: optionalString,
    proposedPatch: stringSchema,
    reason: stringSchema
  },
  { unknownKeys: "passthrough" }
);

export const contextIncludedItemSchema: RuntimeSchema<ContextIncludedItem> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    type: enumSchema(["project", "session", "document", "diagram", "command", "gotcha", "global"]),
    title: stringSchema,
    sourcePath: optionalString,
    visibility: visibilitySchema,
    lastUpdated: optionalString,
    lastVerified: optionalString,
    reason: stringSchema,
    mode: enumSchema(["raw", "summary", "metadata"]),
    content: stringSchema,
    tokenEstimate: numberSchema
  },
  { unknownKeys: "passthrough" }
);

export const contextExcludedItemSchema: RuntimeSchema<ContextExcludedItem> = objectSchema(
  {
    id: stringSchema,
    projectId: optionalString,
    type: stringSchema,
    title: stringSchema,
    sourcePath: optionalString,
    reason: enumSchema([
      "never-send",
      "private",
      "human-only",
      "stale",
      "archived",
      "too-old",
      "unrelated-task",
      "over-token-budget",
      "canonicalized",
      "wrong-project",
      "secret-detected",
      "not-selected"
    ])
  },
  { unknownKeys: "passthrough" }
);

export const redactionSchema: RuntimeSchema<Redaction> = objectSchema(
  {
    itemId: stringSchema,
    kind: enumSchema(["secret", "token", "key", "credential", "private-path"]),
    replacement: stringSchema,
    count: numberSchema,
    severity: enumSchema(["low", "medium", "high"])
  },
  { unknownKeys: "passthrough" }
);

export const contextBundleSchema: RuntimeSchema<ContextBundle> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    visibility: optionalSchema(visibilitySchema),
    sessionId: optionalString,
    created: stringSchema,
    requestedBy: optionalString,
    includedItems: arraySchema(contextIncludedItemSchema),
    excludedItems: arraySchema(contextExcludedItemSchema),
    redactions: arraySchema(redactionSchema),
    tokenEstimate: numberSchema,
    safetyStatus: enumSchema(["clean", "needs-review", "blocked", "index-stale"]),
    auditLogPath: optionalString,
    markdown: stringSchema
  },
  { unknownKeys: "passthrough" }
);

export const searchResultSchema: RuntimeSchema<SearchResult> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    type: enumSchema(["workstream", "session", "document", "proposed-update", "context-bundle"]),
    title: stringSchema,
    path: optionalString,
    status: optionalString,
    visibility: optionalSchema(visibilitySchema),
    updated: optionalString,
    snippet: stringSchema,
    score: numberSchema
  },
  { unknownKeys: "passthrough" }
);

export const graphNodeTypeSchema = enumSchema([
  "project",
  "repo",
  "workstream",
  "topic",
  "service",
  "package",
  "diagram-group",
  "task",
  "session",
  "decision",
  "doc",
  "diagram",
  "code-area",
  "file",
  "command",
  "gotcha",
  "external-reference"
]);

export const graphEdgeTypeSchema = enumSchema([
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
]);

export const semanticGraphEvidenceSchema: RuntimeSchema<SemanticGraphEvidence> = objectSchema(
  {
    documentId: optionalString,
    quote: stringSchema,
    location: optionalString,
    sourcePath: optionalString,
    visibility: optionalSchema(visibilitySchema)
  },
  { unknownKeys: "passthrough" }
);

export const graphNodeSchema: RuntimeSchema<GraphNode> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    type: graphNodeTypeSchema,
    label: stringSchema,
    status: optionalString,
    visibility: optionalSchema(visibilitySchema),
    path: optionalString,
    lastVerified: optionalString
  },
  { unknownKeys: "passthrough" }
);

export const graphEdgeSchema: RuntimeSchema<GraphEdge> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    from: stringSchema,
    to: stringSchema,
    type: graphEdgeTypeSchema,
    visibility: optionalSchema(visibilitySchema),
    reason: stringSchema,
    sourceKind: optionalSchema(enumSchema(["deterministic", "semantic", "deterministic+semantic"])),
    semanticEdgeId: optionalString,
    semanticStatus: optionalSchema(enumSchema(["proposed", "accepted", "rejected", "auto-accepted"])),
    confidence: optionalNumber,
    evidence: optionalSchema(arraySchema(semanticGraphEvidenceSchema))
  },
  { unknownKeys: "passthrough" }
);

export const projectGraphSchema: RuntimeSchema<ProjectGraph> = objectSchema(
  {
    projectId: stringSchema,
    visibility: optionalSchema(visibilitySchema),
    nodes: arraySchema(graphNodeSchema),
    edges: arraySchema(graphEdgeSchema),
    generated: stringSchema
  },
  { unknownKeys: "passthrough" }
);

export const semanticGraphScopeSchema: RuntimeSchema<SemanticGraphScope> = objectSchema(
  {
    kind: enumSchema(["all-docs", "changed-docs", "selected-docs", "focused-graph-node", "workstream", "repo"]),
    documentIds: optionalSchema(strings),
    nodeId: optionalString,
    workstreamId: optionalString,
    repoPath: optionalString
  },
  { unknownKeys: "passthrough" }
);

export const semanticGraphSettingsSchema: RuntimeSchema<SemanticGraphSettings> = objectSchema(
  {
    version: literalSchema(1),
    enabled: booleanSchema,
    mode: enumSchema(["review", "auto", "dry-run"]),
    providerId: optionalString,
    providerKind: optionalString,
    model: optionalString,
    autoAcceptThreshold: numberSchema,
    reviewThreshold: numberSchema,
    discardBelowThreshold: numberSchema,
    maxCandidatesPerDocument: numberSchema,
    maxClusterSize: numberSchema,
    includeDeterministicSignals: booleanSchema,
    includeVectorCandidates: booleanSchema,
    remoteProvidersEnabled: booleanSchema,
    updated: optionalString
  },
  { unknownKeys: "passthrough" }
);

export const semanticGraphEdgeSchema: RuntimeSchema<SemanticGraphEdge> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    from: stringSchema,
    to: stringSchema,
    type: graphEdgeTypeSchema,
    status: enumSchema(["proposed", "accepted", "rejected", "auto-accepted"]),
    visibility: optionalSchema(visibilitySchema),
    confidence: numberSchema,
    reason: stringSchema,
    evidence: arraySchema(semanticGraphEvidenceSchema),
    source: objectSchema(
      {
        kind: enumSchema(["llm", "external-ai", "manual"]),
        providerId: optionalString,
        providerKind: optionalString,
        model: optionalString,
        runId: optionalString,
        sourceAgent: optionalString,
        promptVersion: optionalString
      },
      { unknownKeys: "passthrough" }
    ),
    created: stringSchema,
    updated: stringSchema,
    deterministicEdgeId: optionalString
  },
  { unknownKeys: "passthrough" }
);

const semanticGraphRunWireSchema = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    status: enumSchema(["pending", "running", "completed", "failed", "cancelled"]),
    visibility: optionalSchema(visibilitySchema),
    mode: enumSchema(["review", "auto", "dry-run"]),
    scope: semanticGraphScopeSchema,
    providerId: optionalString,
    providerKind: optionalString,
    model: optionalString,
    started: stringSchema,
    finished: optionalString,
    error: optionalString,
    thresholds: objectSchema({ autoAccept: numberSchema, review: numberSchema, discardBelow: numberSchema }),
    counts: objectSchema({
      documentsTotal: numberSchema,
      documentsAnalyzed: numberSchema,
      extractionsReused: numberSchema,
      candidates: numberSchema,
      judged: numberSchema,
      accepted: numberSchema,
      proposed: numberSchema,
      rejected: numberSchema,
      discarded: numberSchema
    }),
    outputPath: optionalString,
    auditPath: optionalString
  }
);

/** Provider exception text is accepted from the daemon but never crosses the public client boundary. */
export const semanticGraphRunSchema: RuntimeSchema<SemanticGraphRun> = mapSchema(
  semanticGraphRunWireSchema,
  ({ error: _privateProviderError, ...run }) => run
);

export interface SemanticGraphStatus {
  projectId: string;
  visibility?: Visibility;
  settings: SemanticGraphSettings;
  edgeCounts: Record<string, number>;
  runCounts: { total: number; latest?: SemanticGraphRun };
  updated: string;
}

export const semanticGraphStatusSchema: RuntimeSchema<SemanticGraphStatus> = objectSchema(
  {
    projectId: stringSchema,
    visibility: optionalSchema(visibilitySchema),
    settings: semanticGraphSettingsSchema,
    edgeCounts: recordSchema(numberSchema),
    runCounts: objectSchema({ total: numberSchema, latest: optionalSchema(semanticGraphRunSchema) }),
    updated: stringSchema
  },
  { unknownKeys: "passthrough" }
);

export const importProfileSchema: RuntimeSchema<ImportProfile> = objectSchema(
  {
    name: stringSchema,
    description: optionalString,
    include: strings,
    exclude: strings,
    defaultKind: enumSchema(["document", "session", "skip"]),
    defaultDocumentType: documentTypeSchema,
    defaultDocumentStatus: documentStatusSchema,
    defaultSessionStatus: sessionStatusSchema,
    defaultVisibility: visibilitySchema,
    preserveRawBody: booleanSchema,
    topicsFromPath: booleanSchema,
    pathRules: arraySchema(objectSchema(
      {
        match: stringSchema,
        kind: optionalSchema(enumSchema(["document", "session", "skip"])),
        type: optionalSchema(documentTypeSchema),
        status: optionalSchema(documentStatusSchema),
        sessionStatus: optionalSchema(sessionStatusSchema),
        visibility: optionalSchema(visibilitySchema),
        format: optionalSchema(enumSchema(["markdown", "mermaid", "plantuml", "image", "text"])),
        topics: optionalSchema(strings),
        topicsFromPath: optionalBoolean
      },
      { unknownKeys: "passthrough" }
    ))
  },
  { unknownKeys: "passthrough" }
);

export const importCandidateSchema: RuntimeSchema<ImportCandidate> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    sourcePath: stringSchema,
    relativePath: stringSchema,
    sourceHash: stringSchema,
    size: numberSchema,
    kind: enumSchema(["document", "session", "skip"]),
    title: stringSchema,
    documentType: optionalSchema(documentTypeSchema),
    documentStatus: optionalSchema(documentStatusSchema),
    sessionStatus: optionalSchema(sessionStatusSchema),
    visibility: visibilitySchema,
    format: optionalSchema(enumSchema(["markdown", "mermaid", "plantuml", "image", "text"])),
    topics: strings,
    targetPath: optionalString,
    skippedReason: optionalString,
    warnings: strings
  },
  { unknownKeys: "passthrough" }
);

export const importPlanSchema: RuntimeSchema<ImportPlan> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    sourceRoot: stringSchema,
    profileName: stringSchema,
    created: stringSchema,
    candidates: arraySchema(importCandidateSchema),
    counts: objectSchema({
      total: numberSchema,
      documents: numberSchema,
      sessions: numberSchema,
      skipped: numberSchema,
      warnings: numberSchema
    })
  },
  { unknownKeys: "passthrough" }
);

export const importCommitResultSchema: RuntimeSchema<ImportCommitResult> = objectSchema(
  {
    planId: stringSchema,
    projectId: stringSchema,
    committed: numberSchema,
    documents: numberSchema,
    sessions: numberSchema,
    skipped: numberSchema,
    writtenPaths: strings
  },
  { unknownKeys: "passthrough" }
);

export const trashItemSchema: RuntimeSchema<TrashItem> = objectSchema(
  {
    id: stringSchema,
    type: enumSchema(["project", "repo", "workstream", "session", "document", "inbox-proposal", "backup"]),
    projectId: optionalString,
    visibility: optionalSchema(visibilitySchema),
    projectName: optionalString,
    itemId: stringSchema,
    title: stringSchema,
    deletedAt: stringSchema,
    deletedBy: optionalString,
    originalPath: optionalString,
    payloadPath: optionalString,
    metadataPath: stringSchema,
    critical: booleanSchema,
    canRestore: booleanSchema,
    details: optionalSchema(jsonObjectSchema)
  },
  { unknownKeys: "passthrough" }
);

export interface BackupSnapshotItem {
  projectId: string;
  visibility?: Visibility;
  created: string;
  snapshotPath: string;
  note: string;
}

export const backupSnapshotItemSchema: RuntimeSchema<BackupSnapshotItem> = objectSchema(
  {
    projectId: stringSchema,
    visibility: optionalSchema(visibilitySchema),
    created: stringSchema,
    snapshotPath: stringSchema,
    note: stringSchema
  },
  { unknownKeys: "passthrough" }
);

export interface ProjectSummarySnapshot {
  visibility?: Visibility;
  project: Project;
  latestSession?: Session;
  activeSession?: Session;
  counts: {
    sessions: number;
    documents: number;
    workstreams: number;
    diagrams: number;
    pendingInbox: number;
    warnings: number;
  };
  warnings: string[];
}

export const projectSummarySnapshotSchema: RuntimeSchema<ProjectSummarySnapshot> = objectSchema(
  {
    visibility: optionalSchema(visibilitySchema),
    project: projectSchema,
    latestSession: optionalSchema(sessionSchema),
    activeSession: optionalSchema(sessionSchema),
    counts: objectSchema({
      sessions: numberSchema,
      documents: numberSchema,
      workstreams: numberSchema,
      diagrams: numberSchema,
      pendingInbox: numberSchema,
      warnings: numberSchema
    }),
    warnings: strings
  },
  { unknownKeys: "passthrough" }
);

export const projectCreationPreviewSchema: RuntimeSchema<ProjectCreationPreview> = objectSchema(
  {
    requestId: stringSchema,
    proposedProjectName: stringSchema,
    proposedProjectId: stringSchema,
    repoRoot: optionalString,
    memoryLocation: stringSchema,
    willCreatePointerFile: booleanSchema,
    pointerFilePath: optionalString,
    willCreateBootstrapFiles: strings,
    privacyDefaults: strings,
    discoveryLevel: enumSchema(["project-only", "repo-metadata-only"]),
    requiresUserConfirmation: booleanSchema,
    created: stringSchema
  },
  { unknownKeys: "passthrough" }
);

const startupProjectSchema = objectSchema(
  {
    id: stringSchema,
    visibility: optionalSchema(visibilitySchema),
    name: stringSchema,
    updated: stringSchema,
    repoCount: numberSchema,
    repos: arraySchema(objectSchema({ path: stringSchema, name: optionalString, role: stringSchema }, { unknownKeys: "passthrough" }))
  },
  { unknownKeys: "passthrough" }
);

const startupWorkstreamSchema = objectSchema(
  {
    id: stringSchema,
    visibility: optionalSchema(visibilitySchema),
    name: stringSchema,
    slug: stringSchema,
    status: workstreamStatusSchema,
    summary: optionalString,
    goal: optionalString,
    topics: strings,
    updated: stringSchema
  },
  { unknownKeys: "passthrough" }
);

const startupSnapshotSchema = objectSchema(
  {
    schema: literalSchema("zharwing.memory.startup.v2"),
    visibility: optionalSchema(visibilitySchema),
    notModified: optionalSchema(literalSchema(false)),
    revision: stringSchema,
    projectStatus: enumSchema(["resolved", "unregistered", "ambiguous"]),
    workingDirectory: optionalString,
    repoRoot: optionalString,
    detectedBranch: optionalString,
    project: optionalSchema(startupProjectSchema),
    activeSession: optionalSchema(sessionSummarySchema),
    latestSession: optionalSchema(sessionSummarySchema),
    recentSessions: arraySchema(sessionSummarySchema),
    workstreams: arraySchema(startupWorkstreamSchema),
    counts: objectSchema({
      sessionsTotal: numberSchema,
      recentSessionsReturned: numberSchema,
      workstreamsTotal: numberSchema,
      workstreamsReturned: numberSchema
    }),
    recommendedAction: enumSchema(["resume-active", "resume-latest", "start-new", "offer-create-project", "ask-user"]),
    contextReadiness: enumSchema(["ready", "needs-project", "needs-session", "blocked"]),
    safetyStatus: enumSchema(["clean", "needs-review", "blocked", "index-stale"]),
    messageForClient: stringSchema
  },
  { unknownKeys: "passthrough" }
);

const startupNotModifiedSchema = objectSchema(
  {
    schema: literalSchema("zharwing.memory.startup.v2"),
    visibility: optionalSchema(visibilitySchema),
    notModified: literalSchema(true),
    projectId: optionalString,
    sessionId: optionalString,
    revision: stringSchema
  },
  { unknownKeys: "passthrough" }
);

export const startupStateSchema: RuntimeSchema<StartupState> = unionSchema([
  startupSnapshotSchema,
  startupNotModifiedSchema
]);

export const optionalSessionSummarySchema = unionSchema([
  sessionSummarySchema,
  nullSchema,
  optionalSchema(nullableSchema(sessionSummarySchema))
]);

export const jsonObjectArraySchema = arraySchema(jsonObjectSchema);
export const jsonRecordSchema = recordSchema(jsonValueSchema);
export const integerArraySchema = arraySchema(integerSchema);
