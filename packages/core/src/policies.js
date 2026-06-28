import { DEFAULT_ASSISTANT_POLICY, DEFAULT_CONTEXT_POLICY, DEFAULT_MEMORY_WRITE_POLICY, DEFAULT_PRIVACY_POLICY } from "./constants.js";
import { nowIso, slugify } from "./ids.js";
export function createProjectModel(args) {
    const now = nowIso();
    const slug = args.slug || slugify(args.name);
    const repos = args.repoPath
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
export function memoryWritePolicyFor(project) {
    return {
        ...DEFAULT_MEMORY_WRITE_POLICY,
        ...(project.memoryWritePolicy || {})
    };
}
export function isVisibleToAi(visibility) {
    return visibility === "ai-eligible" || visibility === "ai-pinned";
}
export function shouldBlockVisibility(visibility) {
    return visibility === "private" || visibility === "never-send";
}
//# sourceMappingURL=policies.js.map