import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DEFAULT_PROJECT_FILES,
  DEFAULT_PROJECT_FOLDERS,
  createId,
  createProjectModel,
  nowIso,
  slugify,
  type Project,
  type ProjectCreationPreview,
  type ProjectDetectionResult
} from "@aimem/core";
import { ensureDir, normalizePath, pathExists, readJson, writeJson, writeText } from "./fs.js";
import { ProjectRegistry } from "./registry.js";
import { defaultProjectDocument } from "./templates.js";

export interface PointerFile {
  projectId: string;
  memoryRoot: string;
  contextPolicy?: {
    directSessionInclusionDays: number;
    summaryOnlyDays: number;
    maxRawSessions: number;
    maxSummarizedSessions: number;
  };
}

export async function findRepoRoot(start: string): Promise<string | undefined> {
  let current = normalizePath(start);

  while (true) {
    if (await pathExists(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export async function findPointerFile(start: string): Promise<string | undefined> {
  let current = normalizePath(start);

  while (true) {
    const pointer = path.join(current, ".ai-memory.json");
    if (await pathExists(pointer)) return pointer;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export async function detectProject(args: {
  workingDirectory: string;
  registry: ProjectRegistry;
}): Promise<ProjectDetectionResult> {
  const workingDirectory = normalizePath(args.workingDirectory);
  const pointerFilePath = await findPointerFile(workingDirectory);
  const repoRoot = (await findRepoRoot(workingDirectory)) || workingDirectory;

  if (pointerFilePath) {
    const pointer = await readJson<PointerFile | undefined>(pointerFilePath, undefined);
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

export async function prepareProjectCreation(args: {
  workingDirectory: string;
  registry: ProjectRegistry;
  projectName?: string;
  createPointerFile?: boolean;
  bootstrapFiles?: string[];
}): Promise<ProjectCreationPreview> {
  const repoRoot = (await findRepoRoot(args.workingDirectory)) || normalizePath(args.workingDirectory);
  const projectName = args.projectName || path.basename(repoRoot);
  const slug = slugify(projectName);
  const memoryLocation = normalizePath(path.join(args.registry.memoryRoot, "projects", slug));

  return {
    requestId: createId("create-project"),
    proposedProjectName: projectName,
    proposedProjectId: slug,
    repoRoot,
    memoryLocation,
    willCreatePointerFile: args.createPointerFile ?? true,
    pointerFilePath: path.join(repoRoot, ".ai-memory.json"),
    willCreateBootstrapFiles: args.bootstrapFiles || [],
    privacyDefaults: [
      "exclude .env and .env.*",
      "exclude private keys and credentials",
      "exclude .git, node_modules, build outputs, coverage, and caches",
      "block never-send and private documents from context"
    ],
    discoveryLevel: "repo-metadata-only",
    requiresUserConfirmation: true,
    created: nowIso()
  };
}

export async function createProjectFromPreview(args: {
  preview: ProjectCreationPreview;
  registry: ProjectRegistry;
  forceWithoutConfirmation?: boolean;
}): Promise<Project> {
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

export async function ensureProjectWorkspace(project: Project): Promise<void> {
  await ensureDir(project.memoryRoot);
  for (const folder of DEFAULT_PROJECT_FOLDERS) {
    await ensureDir(path.join(project.memoryRoot, folder));
  }

  for (const file of DEFAULT_PROJECT_FILES) {
    const target = path.join(project.memoryRoot, file);
    if (file === "project.json") {
      await writeJson(target, project);
    } else if (!(await pathExists(target))) {
      await writeText(target, defaultProjectDocument(project, file));
    }
  }
}

export async function writePointerFile(pointerFilePath: string, project: Project): Promise<void> {
  const pointer: PointerFile = {
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

async function writeBootstrapFiles(preview: ProjectCreationPreview): Promise<void> {
  for (const file of preview.willCreateBootstrapFiles) {
    if (file !== "AGENTS.md" && file !== "CLAUDE.md") continue;
    const target = path.join(preview.repoRoot, file);
    if (await pathExists(target)) continue;
    await writeText(target, bootstrapInstructions());
  }
}

function bootstrapInstructions(): string {
  return `Use the AI Memory MCP server for this repo.

Start or resume a project-scoped session before work.
Load the default context bundle for this project.
Save checkpoints after meaningful progress.
Close the session with next steps and proposed memory updates.
Do not request sessions from unrelated projects unless the user explicitly asks.
Canonical memory changes must go through the Memory Inbox.
`;
}

export async function validateProjectWorkspace(project: Project): Promise<string[]> {
  const warnings: string[] = [];
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
      if (!stat.isDirectory()) warnings.push(`Expected directory: ${folder}`);
    } catch {
      warnings.push(`Missing project folder: ${folder}`);
    }
  }

  return warnings;
}
