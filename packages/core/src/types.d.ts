export type ISODateString = string;
export type ProjectId = string;
export type SessionId = string;
export type DocumentId = string;
export type ContextBundleId = string;
export type ProposedUpdateId = string;
export type WorkstreamId = string;
export type Visibility = "ai-eligible" | "ai-pinned" | "human-only" | "private" | "never-send";
export type DocumentStatus = "draft" | "active" | "accepted" | "superseded" | "stale" | "archived";
export type SessionStatus = "active" | "closed" | "archived";
export type WorkstreamStatus = "active" | "paused" | "done" | "archived";
export type StartupMode = "auto-resume-project-session" | "ask-when-opening-project" | "always-start-new-session" | "manual";
export type AssistantRuntimeType = "app-managed-llamacpp" | "llama-cpp" | "ollama" | "lm-studio" | "openai" | "anthropic" | "custom-openai-compatible" | "disabled";
export type AssistantState = "off" | "ready" | "running" | "unavailable" | "external";
export type MemoryReviewMode = "off" | "risky-only" | "all";
export type SafetyStatus = "clean" | "needs-review" | "blocked" | "index-stale";
export interface RepoLink {
    path: string;
    name?: string;
    description?: string;
    role: string;
    defaultBranch?: string;
    created: ISODateString;
    updated: ISODateString;
}
export interface PrivacyPolicy {
    defaultVisibility: Visibility;
    ignorePatterns: string[];
    neverSendPatterns: string[];
    redactSecrets: boolean;
    blockOnHighRiskSecrets: boolean;
    allowCrossProjectContext: boolean;
    requireApprovalBeforeServingContext: boolean;
}
export interface ContextPolicy {
    directSessionInclusionDays: number;
    summaryOnlyDays: number;
    maxRawSessions: number;
    maxSummarizedSessions: number;
    maxTokens: number;
    includeGlobalPreferences: boolean;
    startupMode: StartupMode;
    allowLastOpenedProjectFallback: boolean;
    allowAllProjectSearch: boolean;
}
export interface AssistantPolicy {
    enabled: boolean;
    runtimeType: AssistantRuntimeType;
    modelName?: string;
    modelDisplayName?: string;
    modelPath?: string;
    endpoint?: string;
    autoAcceptLowRiskMetadata: boolean;
}
export interface MemoryWritePolicy {
    allowAgentDirectWrites: boolean;
    reviewMode: MemoryReviewMode;
}
export interface Project {
    id: ProjectId;
    name: string;
    slug: string;
    memoryRoot: string;
    repos: RepoLink[];
    created: ISODateString;
    updated: ISODateString;
    lastOpened?: ISODateString;
    privacyPolicy: PrivacyPolicy;
    contextPolicy: ContextPolicy;
    assistantPolicy: AssistantPolicy;
    memoryWritePolicy?: MemoryWritePolicy;
    graphRules?: GraphExtractionRule[];
}
export interface SessionCheckpoint {
    id: string;
    created: ISODateString;
    summary: string;
    nextSteps: string[];
    blockers: string[];
    touchedFiles: string[];
    proposedUpdateIds: ProposedUpdateId[];
}
export interface Session {
    id: SessionId;
    projectId: ProjectId;
    repoPath: string;
    workingDirectory: string;
    branch?: string;
    agent?: string;
    client?: string;
    status: SessionStatus;
    started: ISODateString;
    updated: ISODateString;
    closed?: ISODateString;
    taskTitle: string;
    goal?: string;
    summary?: string;
    topics: string[];
    summaryGeneratedAt?: ISODateString;
    summarySource?: "manual" | "assistant" | "deterministic" | "import";
    summaryModel?: string;
    nextSteps: string[];
    blockers: string[];
    touchedFiles: string[];
    workstreamIds: WorkstreamId[];
    relatedDocs: DocumentId[];
    relatedTasks: string[];
    contextBundleId?: ContextBundleId;
    checkpoints: SessionCheckpoint[];
    filePath?: string;
    body?: string;
    importSourcePath?: string;
    importSourceHash?: string;
    importedAt?: ISODateString;
    importProfile?: string;
}
export type DocumentType = "plan" | "investigation" | "research" | "architecture-note" | "decision-record" | "architecture-decision-record" | "design-requirements-document" | "technical-spec" | "requirement" | "user-flow" | "diagram" | "command-note" | "gotcha" | "meeting-note" | "external-reference" | "scratch-note" | "overview" | "commands" | "glossary" | "privacy";
export interface MemoryDocument {
    id: DocumentId;
    projectId: ProjectId;
    title: string;
    type: DocumentType;
    status: DocumentStatus;
    visibility: Visibility;
    topics: string[];
    workstreamIds: WorkstreamId[];
    relatedTasks: string[];
    relatedFiles: string[];
    relatedSessions: SessionId[];
    relatedDiagrams: DocumentId[];
    created: ISODateString;
    updated: ISODateString;
    lastVerified?: ISODateString;
    confidence?: "low" | "medium" | "high";
    filePath: string;
    body: string;
    diagramType?: string;
    format?: "markdown" | "mermaid" | "plantuml" | "image" | "text";
    importSourcePath?: string;
    importSourceHash?: string;
    importedAt?: ISODateString;
    importProfile?: string;
}
export interface Workstream {
    id: WorkstreamId;
    projectId: ProjectId;
    name: string;
    slug: string;
    status: WorkstreamStatus;
    summary?: string;
    goal?: string;
    topics: string[];
    repoRoles: RepoLink["role"][];
    relatedTasks: string[];
    relatedFiles: string[];
    pinnedDocIds: DocumentId[];
    created: ISODateString;
    updated: ISODateString;
    closed?: ISODateString;
    filePath?: string;
    body: string;
}
export interface WorkstreamDetail {
    workstream: Workstream;
    sessions: Session[];
    documents: MemoryDocument[];
}
export type ImportItemKind = "document" | "session" | "skip";
export type ImportConflictStrategy = "skip" | "overwrite" | "duplicate";
export interface ImportPathRule {
    match: string;
    kind?: ImportItemKind;
    type?: DocumentType;
    status?: DocumentStatus;
    sessionStatus?: SessionStatus;
    visibility?: Visibility;
    format?: MemoryDocument["format"];
    topics?: string[];
    topicsFromPath?: boolean;
}
export interface ImportProfile {
    name: string;
    description?: string;
    include: string[];
    exclude: string[];
    defaultKind: ImportItemKind;
    defaultDocumentType: DocumentType;
    defaultDocumentStatus: DocumentStatus;
    defaultSessionStatus: SessionStatus;
    defaultVisibility: Visibility;
    preserveRawBody: boolean;
    topicsFromPath: boolean;
    pathRules: ImportPathRule[];
}
export interface ImportCandidate {
    id: string;
    projectId: ProjectId;
    sourcePath: string;
    relativePath: string;
    sourceHash: string;
    size: number;
    kind: ImportItemKind;
    title: string;
    documentType?: DocumentType;
    documentStatus?: DocumentStatus;
    sessionStatus?: SessionStatus;
    visibility: Visibility;
    format?: MemoryDocument["format"];
    topics: string[];
    targetPath?: string;
    skippedReason?: string;
    warnings: string[];
}
export interface ImportPlan {
    id: string;
    projectId: ProjectId;
    sourceRoot: string;
    profileName: string;
    created: ISODateString;
    candidates: ImportCandidate[];
    counts: {
        total: number;
        documents: number;
        sessions: number;
        skipped: number;
        warnings: number;
    };
}
export interface ImportCommitResult {
    planId: string;
    projectId: ProjectId;
    committed: number;
    documents: number;
    sessions: number;
    skipped: number;
    writtenPaths: string[];
}
export type ProposedUpdateType = "decision" | "command" | "gotcha" | "architecture" | "task" | "doc-update" | "stale-warning" | "diagram" | "graph-update" | "session-summary";
export type ProposedUpdateStatus = "pending" | "accepted" | "rejected" | "deferred" | "edited";
export interface ProposedMemoryUpdate {
    id: ProposedUpdateId;
    projectId: ProjectId;
    type: ProposedUpdateType;
    status: ProposedUpdateStatus;
    sourceSession?: SessionId;
    sourceAgent?: string;
    sourceKind: "external-ai" | "memory-assistant" | "manual";
    created: ISODateString;
    confidence: "low" | "medium" | "high";
    affectedFiles: string[];
    targetDocument?: DocumentId | string;
    proposedPatch: string;
    reason: string;
}
export interface ContextIncludedItem {
    id: string;
    projectId: ProjectId;
    type: "project" | "session" | "document" | "diagram" | "command" | "gotcha" | "global";
    title: string;
    sourcePath?: string;
    visibility: Visibility;
    lastUpdated?: ISODateString;
    lastVerified?: ISODateString;
    reason: string;
    mode: "raw" | "summary" | "metadata";
    content: string;
    tokenEstimate: number;
}
export interface ContextExcludedItem {
    id: string;
    projectId?: ProjectId;
    type: string;
    title: string;
    sourcePath?: string;
    reason: "never-send" | "private" | "human-only" | "stale" | "archived" | "too-old" | "unrelated-task" | "over-token-budget" | "canonicalized" | "wrong-project" | "secret-detected" | "not-selected";
}
export interface Redaction {
    itemId: string;
    kind: "secret" | "token" | "key" | "credential" | "private-path";
    replacement: string;
    count: number;
    severity: "low" | "medium" | "high";
}
export interface ContextBundle {
    id: ContextBundleId;
    projectId: ProjectId;
    sessionId?: SessionId;
    created: ISODateString;
    requestedBy?: string;
    includedItems: ContextIncludedItem[];
    excludedItems: ContextExcludedItem[];
    redactions: Redaction[];
    tokenEstimate: number;
    safetyStatus: SafetyStatus;
    auditLogPath?: string;
    markdown: string;
}
export interface ProjectDetectionResult {
    workingDirectory: string;
    repoRoot?: string;
    detectedBranch?: string;
    pointerFilePath?: string;
    projectId?: ProjectId;
    projectStatus: "resolved" | "unregistered" | "ambiguous";
    message: string;
}
export interface ProjectCreationPreview {
    requestId: string;
    proposedProjectName: string;
    proposedProjectId: ProjectId;
    repoRoot?: string;
    memoryLocation: string;
    willCreatePointerFile: boolean;
    pointerFilePath?: string;
    willCreateBootstrapFiles: string[];
    privacyDefaults: string[];
    discoveryLevel: "project-only" | "repo-metadata-only";
    requiresUserConfirmation: boolean;
    created: ISODateString;
}
export interface StartupState {
    projectStatus: "resolved" | "unregistered" | "ambiguous";
    workingDirectory?: string;
    repoRoot?: string;
    detectedBranch?: string;
    project?: Project;
    activeSession?: Session;
    latestSession?: Session;
    recentSessions: Session[];
    recommendedAction: "resume-active" | "resume-latest" | "start-new" | "offer-create-project" | "ask-user";
    contextReadiness: "ready" | "needs-project" | "needs-session" | "blocked";
    safetyStatus: SafetyStatus;
    messageForClient: string;
}
export interface SearchResult {
    id: string;
    projectId: ProjectId;
    type: "workstream" | "session" | "document" | "proposed-update" | "context-bundle";
    title: string;
    path?: string;
    status?: string;
    visibility?: Visibility;
    updated?: ISODateString;
    snippet: string;
    score: number;
}
export type TrashItemType = "project" | "repo" | "workstream" | "session" | "document" | "inbox-proposal" | "backup";
export interface TrashItem {
    id: string;
    type: TrashItemType;
    projectId?: ProjectId;
    projectName?: string;
    itemId: string;
    title: string;
    deletedAt: ISODateString;
    deletedBy?: string;
    originalPath?: string;
    payloadPath?: string;
    metadataPath: string;
    critical: boolean;
    canRestore: boolean;
    details?: Record<string, unknown>;
}
export type GraphNodeType = "project" | "repo" | "workstream" | "topic" | "service" | "package" | "diagram-group" | "task" | "session" | "decision" | "doc" | "diagram" | "code-area" | "file" | "command" | "gotcha" | "external-reference";
export interface GraphNode {
    id: string;
    projectId: ProjectId;
    type: GraphNodeType;
    label: string;
    status?: string;
    visibility?: Visibility;
    path?: string;
    lastVerified?: ISODateString;
}
export interface GraphEdge {
    id: string;
    projectId: ProjectId;
    from: string;
    to: string;
    type: "works-on" | "touched" | "referenced" | "produced" | "affects" | "supersedes" | "supports" | "explains" | "mentions" | "uses" | "contains" | "depends-on" | "blocked-by" | "belongs-to" | "related";
    reason: string;
}
export type GraphRuleNodeType = "topic" | "service" | "package" | "diagram-group" | "code-area" | "external-reference";
export type GraphRuleEdgeType = "supports" | "explains" | "mentions" | "uses" | "contains" | "depends-on" | "related";
export interface GraphExtractionRule {
    match: string;
    nodeType: GraphRuleNodeType;
    label?: string;
    segment?: number;
    slugFromSegment?: number;
    labelFromSegment?: number;
    edgeType?: GraphRuleEdgeType;
    topic?: string;
}
export interface ProjectGraph {
    projectId: ProjectId;
    nodes: GraphNode[];
    edges: GraphEdge[];
    generated: ISODateString;
}
