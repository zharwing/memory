import {
  DEFAULT_ASSISTANT_POLICY,
  DEFAULT_CONTEXT_POLICY,
  DEFAULT_MEMORY_WRITE_POLICY,
  DEFAULT_PRIVACY_POLICY
} from "./constants.js";
import { nowIso, slugify } from "./ids.js";
import type { MemoryWritePolicy, Project, RepoLink } from "./types.js";

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
    privacyPolicy: { ...DEFAULT_PRIVACY_POLICY },
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
  return visibility === "private" || visibility === "never-send";
}
