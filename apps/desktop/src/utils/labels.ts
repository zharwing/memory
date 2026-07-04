export function reviewModeLabel(mode: string): string {
  if (mode === "all") return "All updates require review";
  if (mode === "risky-only") return "Only risky updates";
  return "Off - direct writes";
}

export function visibilityLabel(value: string | undefined): string {
  switch (value) {
    case "ai-eligible":
      return "AI can use";
    case "ai-pinned":
      return "Always include for AI";
    case "human-only":
      return "Human only";
    case "private":
      return "Private";
    case "never-send":
      return "Never send to AI";
    case undefined:
    case "":
      return "Not applicable";
    default:
      return humanizeEnum(value);
  }
}

export function statusLabel(value: string | undefined): string {
  if (!value) return "Unknown";
  switch (value) {
    case "active":
      return "Active";
    case "draft":
      return "Draft";
    case "accepted":
      return "Accepted";
    case "superseded":
      return "Superseded";
    case "stale":
      return "Stale";
    case "archived":
      return "Archived";
    case "closed":
      return "Closed";
    case "paused":
      return "Paused";
    case "done":
      return "Done";
    case "pending":
      return "Pending review";
    case "rejected":
      return "Rejected";
    case "deferred":
      return "Deferred";
    case "edited":
      return "Edited";
    default:
      return humanizeEnum(value);
  }
}

export function searchResultTypeLabel(value: string | undefined): string {
  if (!value) return "Result";
  switch (value) {
    case "document":
      return "Document";
    case "diagram":
      return "Diagram";
    case "session":
      return "Session";
    case "workstream":
      return "Workstream";
    case "proposed-update":
      return "Inbox proposal";
    case "context-bundle":
      return "Context bundle";
    case "graph-update":
      return "Graph rule proposal";
    case "session-summary":
      return "Session summary";
    default:
      return humanizeEnum(value);
  }
}

export function humanizeEnum(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => {
      if (part.toLowerCase() === "ai") return "AI";
      if (part.toLowerCase() === "api") return "API";
      return part.slice(0, 1).toUpperCase() + part.slice(1);
    })
    .join(" ");
}
