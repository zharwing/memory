export type ISODateString = string;

export type ProjectId = string;
export type SessionId = string;
export type DocumentId = string;
export type ContextBundleId = string;
export type ProposedUpdateId = string;

export type Visibility =
  | "ai-eligible"
  | "ai-pinned"
  | "human-only"
  | "private"
  | "never-send";

export type DocumentStatus =
  | "draft"
  | "active"
  | "accepted"
  | "superseded"
  | "stale"
  | "archived";

export type SessionStatus = "active" | "closed" | "archived";

export type StartupMode =
  | "auto-resume-project-session"
  | "ask-when-opening-project"
  | "always-start-new-session"
  | "manual";

export type AssistantRuntimeType =
  | "app-managed-llamacpp"
  | "ollama"
  | "lm-studio"
  | "custom-openai-compatible"
  | "disabled";

export type AssistantState =
  | "off"
  | "ready"
  | "running"
  | "unavailable"
  | "external";

export type SafetyStatus =
  | "clean"
  | "needs-review"
  | "blocked"
  | "index-stale";

export interface RepoLink {
  path: string;
  role: "primary" | "frontend" | "backend" | "docs" | "worktree" | "other";
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
  modelPath?: string;
  endpoint?: string;
  autoAcceptLowRiskMetadata: boolean;
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
  nextSteps: string[];
  blockers: string[];
  touchedFiles: string[];
  relatedDocs: DocumentId[];
  relatedTasks: string[];
  contextBundleId?: ContextBundleId;
  checkpoints: SessionCheckpoint[];
  filePath?: string;
  body?: string;
}

export type DocumentType =
  | "plan"
  | "investigation"
  | "research"
  | "architecture-note"
  | "decision-record"
  | "architecture-decision-record"
  | "design-requirements-document"
  | "technical-spec"
  | "requirement"
  | "user-flow"
  | "diagram"
  | "command-note"
  | "gotcha"
  | "meeting-note"
  | "external-reference"
  | "scratch-note"
  | "overview"
  | "commands"
  | "glossary"
  | "privacy";

export interface MemoryDocument {
  id: DocumentId;
  projectId: ProjectId;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
  visibility: Visibility;
  topics: string[];
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
}

export type ProposedUpdateType =
  | "decision"
  | "command"
  | "gotcha"
  | "architecture"
  | "task"
  | "doc-update"
  | "stale-warning"
  | "diagram"
  | "session-summary";

export type ProposedUpdateStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "deferred"
  | "edited";

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
  reason:
    | "never-send"
    | "private"
    | "human-only"
    | "stale"
    | "archived"
    | "too-old"
    | "unrelated-task"
    | "over-token-budget"
    | "canonicalized"
    | "wrong-project"
    | "secret-detected"
    | "not-selected";
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
  repoRoot: string;
  memoryLocation: string;
  willCreatePointerFile: boolean;
  pointerFilePath?: string;
  willCreateBootstrapFiles: string[];
  privacyDefaults: string[];
  discoveryLevel: "repo-metadata-only";
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
  recommendedAction:
    | "resume-active"
    | "resume-latest"
    | "start-new"
    | "offer-create-project"
    | "ask-user";
  contextReadiness: "ready" | "needs-project" | "needs-session" | "blocked";
  safetyStatus: SafetyStatus;
  messageForClient: string;
}

export interface SearchResult {
  id: string;
  projectId: ProjectId;
  type: "session" | "document" | "proposed-update" | "context-bundle";
  title: string;
  path?: string;
  status?: string;
  visibility?: Visibility;
  updated?: ISODateString;
  snippet: string;
  score: number;
}

export type GraphNodeType =
  | "project"
  | "repo"
  | "task"
  | "session"
  | "decision"
  | "doc"
  | "diagram"
  | "code-area"
  | "file"
  | "command"
  | "gotcha"
  | "external-reference";

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
  type:
    | "works-on"
    | "touched"
    | "referenced"
    | "produced"
    | "affects"
    | "supersedes"
    | "supports"
    | "explains"
    | "uses"
    | "blocked-by"
    | "belongs-to"
    | "related";
  reason: string;
}

export interface ProjectGraph {
  projectId: ProjectId;
  nodes: GraphNode[];
  edges: GraphEdge[];
  generated: ISODateString;
}
