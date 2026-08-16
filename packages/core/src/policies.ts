import {
  DEFAULT_ASSISTANT_POLICY,
  DEFAULT_CONTEXT_POLICY,
  DEFAULT_MEMORY_WRITE_POLICY,
  DEFAULT_PRIVACY_POLICY
} from "./constants.js";
import { nowIso } from "./ids.js";
import { normalizeNewProjectId } from "./project-id.js";
import type {
  MemoryWritePolicy,
  PrivacyPolicy,
  PrivacyProfile,
  Project,
  RepoLink,
  Visibility
} from "./types.js";

export const ALL_VISIBILITIES = [
  "ai-eligible",
  "ai-pinned",
  "review-required",
  "human-only",
  "private",
  "never-send"
] as const satisfies readonly Visibility[];

export function createProjectModel(args: {
  name: string;
  memoryRoot: string;
  repoPath?: string;
  slug?: string;
  profile?: PrivacyProfile;
  privacyPolicy?: Partial<PrivacyPolicy>;
}): Project {
  const now = nowIso();
  const slug = normalizeNewProjectId(args.slug || args.name);
  const repos: RepoLink[] = args.repoPath
    ? [
        {
          path: args.repoPath,
          name: args.repoPath.split(/[\\/]/).pop() || args.name,
          role: "primary",
          created: now,
          updated: now
        }
      ]
    : [];

  return {
    id: slug,
    name: args.name,
    slug,
    memoryRoot: args.memoryRoot,
    repos,
    created: now,
    updated: now,
    lastOpened: now,
    privacyPolicy: privacyPolicyFor(args.profile ?? "personal-preview", args.privacyPolicy),
    contextPolicy: { ...DEFAULT_CONTEXT_POLICY },
    assistantPolicy: { ...DEFAULT_ASSISTANT_POLICY },
    memoryWritePolicy: { ...DEFAULT_MEMORY_WRITE_POLICY },
    graphRules: []
  };
}

export function memoryWritePolicyFor(project: Pick<Project, "memoryWritePolicy">): MemoryWritePolicy {
  return {
    ...DEFAULT_MEMORY_WRITE_POLICY,
    ...(project.memoryWritePolicy || {})
  };
}

export function isVisibleToAi(visibility: string): boolean {
  return visibility === "ai-eligible" || visibility === "ai-pinned";
}

export function shouldBlockVisibility(visibility: string): boolean {
  return visibility === "review-required" ||
    visibility === "human-only" ||
    visibility === "private" ||
    visibility === "never-send";
}

export function isVisibility(value: unknown): value is Visibility {
  return typeof value === "string" && (ALL_VISIBILITIES as readonly string[]).includes(value);
}

/** Missing or malformed metadata is never silently promoted to AI-visible. */
export function visibilityOrReviewRequired(value: unknown): Visibility {
  return isVisibility(value) ? value : "review-required";
}

/**
 * Resolves the effective project policy for a named runtime profile. Hardened
 * operation never inherits the legacy AI-visible default.
 */
export function privacyPolicyFor(
  profile: PrivacyProfile,
  policy: Partial<PrivacyPolicy> = {}
): PrivacyPolicy {
  return {
    ...DEFAULT_PRIVACY_POLICY,
    ...policy,
    defaultVisibility: profile === "hardened-local"
      ? visibilityOrReviewRequired(policy.defaultVisibility)
      : (isVisibility(policy.defaultVisibility)
          ? policy.defaultVisibility
          : DEFAULT_PRIVACY_POLICY.defaultVisibility)
  };
}
