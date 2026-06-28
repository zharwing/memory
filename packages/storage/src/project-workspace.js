import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_FILES, DEFAULT_PROJECT_FOLDERS, createId, createProjectModel, nowIso, slugify } from "@aimem/core";
import { ensureDir, normalizePath, pathExists, readJson, writeJson, writeText } from "./fs.js";
import { defaultProjectDocument } from "./templates.js";
export async function findRepoRoot(start) {
    let current = normalizePath(start);
    while (true) {
        if (await pathExists(path.join(current, ".git"))) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current)
            return undefined;
        current = parent;
    }
}
export async function findPointerFile(start) {
    let current = normalizePath(start);
    while (true) {
        const pointer = path.join(current, ".ai-memory.json");
        if (await pathExists(pointer))
            return pointer;
        const parent = path.dirname(current);
        if (parent === current)
            return undefined;
        current = parent;
    }
}
export async function detectProject(args) {
    const workingDirectory = normalizePath(args.workingDirectory);
    const pointerFilePath = await findPointerFile(workingDirectory);
    const repoRoot = (await findRepoRoot(workingDirectory)) || workingDirectory;
    if (pointerFilePath) {
        const pointer = await readJson(pointerFilePath, undefined);
        if (pointer?.projectId) {
            return {
                workingDirectory,
                repoRoot,
                pointerFilePath,
                projectId: pointer.projectId,
                projectStatus: "resolved",
                message: "Resolved project from .ai-memory.json pointer file."
            };
        }
    }
    const byRepo = await args.registry.findByRepo(repoRoot);
    if (byRepo) {
        return {
            workingDirectory,
            repoRoot,
            projectId: byRepo.id,
            projectStatus: "resolved",
            message: "Resolved project from registry repo path."
        };
    }
    return {
        workingDirectory,
        repoRoot,
        projectStatus: "unregistered",
        message: "No AI Memory project is linked to this working directory."
    };
}
export async function prepareProjectCreation(args) {
    const repoRoot = args.workingDirectory
        ? (await findRepoRoot(args.workingDirectory)) || normalizePath(args.workingDirectory)
        : undefined;
    const projectName = args.projectName || (repoRoot ? path.basename(repoRoot) : undefined);
    if (!projectName) {
        throw new Error("Project name is required when creating a project without an initial repo.");
    }
    const slug = slugify(projectName);
    const memoryLocation = normalizePath(path.join(args.registry.memoryRoot, "projects", slug));
    const willCreatePointerFile = Boolean(repoRoot && (args.createPointerFile ?? true));
    return {
        requestId: createId("create-project"),
        proposedProjectName: projectName,
        proposedProjectId: slug,
        repoRoot,
        memoryLocation,
        willCreatePointerFile,
        pointerFilePath: repoRoot && willCreatePointerFile ? path.join(repoRoot, ".ai-memory.json") : undefined,
        willCreateBootstrapFiles: args.bootstrapFiles || [],
        privacyDefaults: [
            "exclude .env and .env.*",
            "exclude private keys and credentials",
            "exclude .git, node_modules, build outputs, coverage, and caches",
            "block never-send and private documents from context"
        ],
        discoveryLevel: repoRoot ? "repo-metadata-only" : "project-only",
        requiresUserConfirmation: true,
        created: nowIso()
    };
}
export async function createProjectFromPreview(args) {
    const project = createProjectModel({
        name: args.preview.proposedProjectName,
        slug: args.preview.proposedProjectId,
        repoPath: args.preview.repoRoot,
        memoryRoot: args.preview.memoryLocation
    });
    await ensureProjectWorkspace(project);
    if (args.preview.willCreatePointerFile && args.preview.pointerFilePath) {
        await writePointerFile(args.preview.pointerFilePath, project);
    }
    await writeBootstrapFiles(args.preview);
    await args.registry.register(project);
    return project;
}
export async function ensureProjectWorkspace(project) {
    await ensureDir(project.memoryRoot);
    for (const folder of DEFAULT_PROJECT_FOLDERS) {
        await ensureDir(path.join(project.memoryRoot, folder));
    }
    for (const file of DEFAULT_PROJECT_FILES) {
        const target = path.join(project.memoryRoot, file);
        if (file === "project.json") {
            await writeJson(target, project);
        }
        else if (!(await pathExists(target))) {
            await writeText(target, defaultProjectDocument(project, file));
        }
    }
}
export async function writeProjectFile(project) {
    await writeJson(path.join(project.memoryRoot, "project.json"), project);
}
export async function linkProjectRepo(args) {
    const repoRoot = await resolveRepoLinkPath(args.repoPath);
    const now = nowIso();
    const role = normalizeRepoRole(args.role);
    const existingIndex = args.project.repos.findIndex((repo) => normalizePath(repo.path) === repoRoot);
    const existing = existingIndex === -1 ? undefined : args.project.repos[existingIndex];
    const repo = {
        path: repoRoot,
        name: args.name || existing?.name || path.basename(repoRoot),
        description: args.description ?? existing?.description,
        role,
        defaultBranch: args.defaultBranch ?? existing?.defaultBranch,
        created: existing?.created || now,
        updated: now
    };
    const repos = existing
        ? args.project.repos.map((candidate, index) => (index === existingIndex ? repo : candidate))
        : [...args.project.repos, repo];
    const nextProject = {
        ...args.project,
        repos,
        updated: now
    };
    await writeProjectFile(nextProject);
    const pointerFilePath = path.join(repoRoot, ".ai-memory.json");
    if (args.writePointerFile ?? true) {
        await writePointerFile(pointerFilePath, nextProject);
    }
    return {
        project: nextProject,
        repo,
        action: existing ? "updated" : "created",
        pointerFilePath: args.writePointerFile ?? true ? pointerFilePath : undefined
    };
}
export async function unlinkProjectRepo(args) {
    const repoRoot = await resolveRepoPathForUnlink(args.repoPath);
    const existing = args.project.repos.find((repo) => normalizePath(repo.path) === repoRoot);
    if (!existing) {
        throw new Error(`Repo is not linked to project ${args.project.id}: ${repoRoot}`);
    }
    const now = nowIso();
    const nextProject = {
        ...args.project,
        repos: args.project.repos.filter((repo) => normalizePath(repo.path) !== repoRoot),
        updated: now
    };
    await writeProjectFile(nextProject);
    const pointerFilePath = path.join(repoRoot, ".ai-memory.json");
    let pointerRemoved = false;
    if (args.removePointerFile ?? true) {
        await fs.rm(pointerFilePath, { force: true });
        pointerRemoved = true;
    }
    return {
        project: nextProject,
        removedRepo: existing,
        pointerFilePath,
        pointerRemoved
    };
}
export async function resolveRepoLinkPath(input) {
    const normalized = normalizePath(input);
    if (!(await pathExists(normalized))) {
        throw new Error(`Repo path does not exist: ${input}`);
    }
    return (await findRepoRoot(normalized)) || normalized;
}
async function resolveRepoPathForUnlink(input) {
    const normalized = normalizePath(input);
    if (!(await pathExists(normalized)))
        return normalized;
    return (await findRepoRoot(normalized)) || normalized;
}
function normalizePrimaryRepo(project, preferredPrimaryPath) {
    if (preferredPrimaryPath) {
        return {
            ...project,
            repos: project.repos.map((repo) => normalizePath(repo.path) === preferredPrimaryPath
                ? { ...repo, role: "primary" }
                : repo.role === "primary"
                    ? { ...repo, role: "other" }
                    : repo)
        };
    }
    const primaryIndex = project.repos.findIndex((repo) => repo.role === "primary");
    if (primaryIndex !== -1) {
        return {
            ...project,
            repos: project.repos.map((repo, index) => index === primaryIndex ? repo : repo.role === "primary" ? { ...repo, role: "other" } : repo)
        };
    }
    return project;
}
export async function writePointerFile(pointerFilePath, project) {
    const pointer = {
        projectId: project.id,
        memoryRoot: project.memoryRoot,
        contextPolicy: {
            directSessionInclusionDays: project.contextPolicy.directSessionInclusionDays,
            summaryOnlyDays: project.contextPolicy.summaryOnlyDays,
            maxRawSessions: project.contextPolicy.maxRawSessions,
            maxSummarizedSessions: project.contextPolicy.maxSummarizedSessions
        }
    };
    await writeJson(pointerFilePath, pointer);
}
async function writeBootstrapFiles(preview) {
    if (!preview.repoRoot)
        return;
    for (const file of preview.willCreateBootstrapFiles) {
        if (file !== "AGENTS.md" && file !== "CLAUDE.md")
            continue;
        const target = path.join(preview.repoRoot, file);
        if (await pathExists(target))
            continue;
        await writeText(target, bootstrapInstructions());
    }
}
function normalizeRepoRole(input) {
    const role = String(input || "other").trim().toLowerCase();
    return role || "other";
}
function bootstrapInstructions() {
    return `Use AI Memory as the durable project memory, session history, search, and context layer for this repo.

Resolve the active project from this directory or the linked .ai-memory.json pointer before work.
Search project memory before making assumptions.
Start or resume a project-scoped session for meaningful work.
Preview or load a context bundle when prior context matters.
Save checkpoints after meaningful progress.
Close the session with summary, next steps, blockers, and touched files when known.
Keep session progress in the session file. Write durable docs directly for reusable project memory when review mode is off.
Use Memory Inbox proposals only when review mode is enabled or the update is risky, uncertain, or needs human judgment.
Do not request unrelated project context unless the user explicitly asks and policy allows it.
Do not ingest secrets, credentials, local credential caches, .env files, private keys, or tokens.
`;
}
export async function validateProjectWorkspace(project) {
    const warnings = [];
    if (!(await pathExists(project.memoryRoot))) {
        warnings.push(`Missing memory root: ${project.memoryRoot}`);
        return warnings;
    }
    for (const file of DEFAULT_PROJECT_FILES) {
        if (!(await pathExists(path.join(project.memoryRoot, file)))) {
            warnings.push(`Missing project file: ${file}`);
        }
    }
    for (const folder of DEFAULT_PROJECT_FOLDERS) {
        const statsPath = path.join(project.memoryRoot, folder);
        try {
            const stat = await fs.stat(statsPath);
            if (!stat.isDirectory())
                warnings.push(`Expected directory: ${folder}`);
        }
        catch {
            warnings.push(`Missing project folder: ${folder}`);
        }
    }
    return warnings;
}
//# sourceMappingURL=project-workspace.js.map