/** The closed set of resource invalidation tags emitted by operation metadata. */
export const RESOURCE_IDS = [
  "assistant-policy",
  "assistant-status",
  "backups",
  "context-bundles",
  "documents",
  "inbox",
  "mcp-installation",
  "project-content",
  "project-graph",
  "project-index",
  "project-policy",
  "project-repos",
  "project-summary",
  "project-workspace",
  "projects",
  "provider-secret-status",
  "search",
  "semantic-edges",
  "semantic-runs",
  "semantic-settings",
  "semantic-status",
  "sessions",
  "trash",
  "workstreams"
] as const;

export type ResourceId = (typeof RESOURCE_IDS)[number];
