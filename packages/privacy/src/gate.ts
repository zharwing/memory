import type {
  ContextExcludedItem,
  PrivacyPolicy,
  Redaction,
  SafetyStatus,
  Visibility
} from "@zharwing/memory-core";
import { matchesAnyPattern } from "./patterns.js";
import { redactSecrets, scanSecrets } from "./secrets.js";

export interface PrivacyCandidate {
  id: string;
  projectId?: string;
  type: string;
  title: string;
  sourcePath?: string;
  visibility: Visibility;
  content: string;
}

export interface PrivacyDecision {
  allowed: boolean;
  content: string;
  excluded?: ContextExcludedItem;
  redactions: Redaction[];
  safetyStatus: SafetyStatus;
}

export function applyPrivacyGate(candidate: PrivacyCandidate, policy: PrivacyPolicy): PrivacyDecision {
  const excluded = exclusionFor(candidate, policy);
  if (excluded) {
    return {
      allowed: false,
      content: "",
      excluded,
      redactions: [],
      safetyStatus: excluded.reason === "secret-detected" ? "blocked" : "needs-review"
    };
  }

  const highRiskSecrets = scanSecrets(candidate.content).filter((finding) => finding.severity === "high");
  if (highRiskSecrets.length > 0 && policy.blockOnHighRiskSecrets) {
    return {
      allowed: false,
      content: "",
      excluded: {
        id: candidate.id,
        projectId: candidate.projectId,
        type: candidate.type,
        title: candidate.title,
        sourcePath: candidate.sourcePath,
        reason: "secret-detected"
      },
      redactions: [],
      safetyStatus: "blocked"
    };
  }

  if (!policy.redactSecrets) {
    return {
      allowed: true,
      content: candidate.content,
      redactions: [],
      safetyStatus: "clean"
    };
  }

  const redacted = redactSecrets(candidate.content);
  return {
    allowed: true,
    content: redacted.content,
    redactions: redacted.redactions.map((redaction) => ({ ...redaction, itemId: candidate.id })),
    safetyStatus: redacted.redactions.length > 0 ? "needs-review" : "clean"
  };
}

export function combineSafetyStatus(statuses: SafetyStatus[]): SafetyStatus {
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("index-stale")) return "index-stale";
  if (statuses.includes("needs-review")) return "needs-review";
  return "clean";
}

function exclusionFor(candidate: PrivacyCandidate, policy: PrivacyPolicy): ContextExcludedItem | undefined {
  if (candidate.visibility === "never-send") {
    return excluded(candidate, "never-send");
  }
  if (candidate.visibility === "private") {
    return excluded(candidate, "private");
  }
  if (candidate.visibility === "human-only") {
    return excluded(candidate, "human-only");
  }
  if (matchesAnyPattern(candidate.sourcePath, policy.neverSendPatterns)) {
    return excluded(candidate, "never-send");
  }
  if (matchesAnyPattern(candidate.sourcePath, policy.ignorePatterns)) {
    return excluded(candidate, "not-selected");
  }
  return undefined;
}

function excluded(candidate: PrivacyCandidate, reason: ContextExcludedItem["reason"]): ContextExcludedItem {
  return {
    id: candidate.id,
    projectId: candidate.projectId,
    type: candidate.type,
    title: candidate.title,
    sourcePath: candidate.sourcePath,
    reason
  };
}
