import type {
  AssistantPolicy,
  ContextPolicy,
  DocumentType,
  MemoryWritePolicy,
  PrivacyPolicy,
  SemanticGraphSettings
} from "./types.js";

// The default on-disk root name predates the Zharwing rename and stays
// "AI Memory Root" so existing local stores keep resolving without migration.
export const DEFAULT_MEMORY_ROOT_NAME = "AI Memory Root";

export interface CanonicalProjectFile {
  /** File name directly under the project memory root. */
  name: string;
  /** False only for project.json, which is JSON metadata, not a document. */
  markdown: boolean;
  /** Document type inferred for the file when frontmatter has none. */
  documentType?: DocumentType;
  /**
   * Default document title. Undefined for overview.md, whose title is derived
   * from the project name ("<project> Overview") by the template layer.
   */
  title?: string;
  /** True when the file is a canonical context-bundle candidate. */
  includeInContext: boolean;
}

/**
 * Single source of truth for the canonical files scaffolded into every
 * project memory root. DEFAULT_PROJECT_FILES, the document lister, the
 * template titles, and the context-engine canonical candidates all derive
 * from this table.
 */
export const CANONICAL_PROJECT_FILES: readonly CanonicalProjectFile[] = [
  { name: "project.json", markdown: false, includeInContext: false },
  { name: "overview.md", markdown: true, documentType: "overview", includeInContext: true },
  { name: "architecture.md", markdown: true, documentType: "architecture-note", title: "Architecture", includeInContext: true },
  { name: "decisions.md", markdown: true, documentType: "decision-record", title: "Decisions", includeInContext: true },
  { name: "tasks.md", markdown: true, documentType: "plan", title: "Tasks", includeInContext: false },
  { name: "gotchas.md", markdown: true, documentType: "gotcha", title: "Gotchas", includeInContext: true },
  { name: "commands.md", markdown: true, documentType: "commands", title: "Commands", includeInContext: true },
  { name: "glossary.md", markdown: true, documentType: "glossary", title: "Glossary", includeInContext: false },
  { name: "privacy.md", markdown: true, documentType: "privacy", title: "Privacy Rules", includeInContext: false }
];

export const DEFAULT_PROJECT_FILES: readonly string[] = CANONICAL_PROJECT_FILES.map((file) => file.name);

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

export interface ProviderDefault {
  /** Default endpoint for the provider; absent for kinds with no default. */
  endpoint?: string;
  /** Human-readable provider label. */
  label: string;
}

/**
 * Canonical AI provider defaults shared by the assistant runtime, daemon, and
 * desktop UI. Endpoints follow the daemon's provider table; labels follow the
 * desktop assistant settings screen.
 */
export const PROVIDER_DEFAULTS = {
  "lm-studio": { endpoint: "http://127.0.0.1:1234/v1", label: "LM Studio" },
  ollama: { endpoint: "http://127.0.0.1:11434", label: "Ollama" },
  "llama-cpp": { endpoint: "http://127.0.0.1:8080/v1", label: "llama.cpp server" },
  openai: { endpoint: "https://api.openai.com/v1", label: "OpenAI API" },
  anthropic: { endpoint: "https://api.anthropic.com", label: "Claude API" },
  "custom-openai-compatible": { label: "OpenAI-compatible API" },
  "app-managed-llamacpp": { label: "Legacy app-managed local model (unsupported)" }
} as const satisfies Record<string, ProviderDefault>;

export type ProviderDefaultKind = keyof typeof PROVIDER_DEFAULTS;

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
