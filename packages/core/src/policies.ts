import {
  DEFAULT_ASSISTANT_POLICY,
  DEFAULT_CONTEXT_POLICY,
  DEFAULT_PRIVACY_POLICY
} from "./constants.js";
import { nowIso, slugify } from "./ids.js";
import type { Project, RepoLink } from "./types.js";

export function createProjectModel(args: {
  name: string;
  memoryRoot: string;
  repoPath?: string;
  slug?: string;
}): Project {
  const now = nowIso();
  const slug = args.slug || slugify(args.name);
  const repos: RepoLink[] = args.repoPath
    ? [
        {
          path: args.repoPath,
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
    privacyPolicy: { ...DEFAULT_PRIVACY_POLICY },
    contextPolicy: { ...DEFAULT_CONTEXT_POLICY },
    assistantPolicy: { ...DEFAULT_ASSISTANT_POLICY }
  };
}

export function isVisibleToAi(visibility: string): boolean {
  return visibility === "ai-eligible" || visibility === "ai-pinned";
}

export function shouldBlockVisibility(visibility: string): boolean {
  return visibility === "private" || visibility === "never-send";
}
