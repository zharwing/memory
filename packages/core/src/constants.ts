import type {
  AssistantPolicy,
  ContextPolicy,
  MemoryWritePolicy,
  PrivacyPolicy,
  SemanticGraphSettings
} from "./types.js";

// The default on-disk root name predates the Zharwing rename and stays
// "AI Memory Root" so existing local stores keep resolving without migration.
export const DEFAULT_MEMORY_ROOT_NAME = "AI Memory Root";

export const DEFAULT_PROJECT_FILES = [
  "project.json",
  "overview.md",
  "architecture.md",
  "decisions.md",
  "tasks.md",
  "gotchas.md",
  "commands.md",
  "glossary.md",
  "privacy.md"
] as const;

export const DEFAULT_PROJECT_FOLDERS = [
  "sessions",
  "docs/plans",
  "docs/investigations",
  "docs/research",
  "docs/architecture",
  "docs/decisions",
  "docs/requirements",
  "docs/specs",
  "docs/user-flows",
  "docs/diagrams",
  "docs/notes",
  "docs/references",
  "docs/archive",
  "workstreams",
  "assets/images",
  "assets/screenshots",
  "assets/attachments",
  "semantic-graph",
  "generated/context-bundles",
  "generated/semantic/doc-extractions",
  "generated/semantic/runs",
  "generated/exports",
  "generated/assistant-drafts",
  "inbox/proposed-updates",
  "inbox/imported-docs",
  "inbox/review-needed",
  "audit/context-bundles",
  "audit/assistant-runs",
  "audit/semantic-runs",
  "backups/snapshots"
] as const;

export const DEFAULT_IGNORE_PATTERNS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "id_rsa",
  "id_ed25519",
  "credentials.json",
  "secrets.*",
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  "coverage/",
  ".cache/",
  "*.zip",
  "*.tar",
  "*.gz",
  "*.7z",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.webp",
  "*.pdf"
] as const;

export const DEFAULT_NEVER_SEND_PATTERNS = [
  "private/**",
  "**/*.secret.*",
  "**/secrets/**",
  "**/credentials/**",
  "**/.env",
  "**/.env.*"
] as const;

export const DEFAULT_PRIVACY_POLICY: PrivacyPolicy = {
  defaultVisibility: "ai-eligible",
  ignorePatterns: [...DEFAULT_IGNORE_PATTERNS],
  neverSendPatterns: [...DEFAULT_NEVER_SEND_PATTERNS],
  redactSecrets: true,
  blockOnHighRiskSecrets: true,
  allowCrossProjectContext: false,
  requireApprovalBeforeServingContext: false
};

export const DEFAULT_CONTEXT_POLICY: ContextPolicy = {
  directSessionInclusionDays: 7,
  summaryOnlyDays: 30,
  maxRawSessions: 3,
  maxSummarizedSessions: 5,
  maxTokens: 24000,
  includeGlobalPreferences: true,
  startupMode: "ask-when-opening-project",
  allowLastOpenedProjectFallback: false,
  allowAllProjectSearch: false
};

export const DEFAULT_ASSISTANT_POLICY: AssistantPolicy = {
  enabled: false,
  runtimeType: "disabled",
  autoAcceptLowRiskMetadata: false
};

export const DEFAULT_MEMORY_WRITE_POLICY: MemoryWritePolicy = {
  allowAgentDirectWrites: true,
  reviewMode: "off"
};

export const DEFAULT_SEMANTIC_GRAPH_SETTINGS: SemanticGraphSettings = {
  version: 1,
  enabled: false,
  mode: "review",
  autoAcceptThreshold: 0.9,
  reviewThreshold: 0.62,
  discardBelowThreshold: 0.35,
  maxCandidatesPerDocument: 12,
  maxClusterSize: 16,
  includeDeterministicSignals: true,
  includeVectorCandidates: false,
  remoteProvidersEnabled: false
};
