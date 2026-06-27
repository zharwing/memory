import path from "node:path";
import {
  DEFAULT_MEMORY_ROOT_NAME,
  createProjectModel,
  type Project,
  type ProjectId
} from "@aimem/core";
import { ensureDir, normalizePath, pathExists, readJson, writeJson } from "./fs.js";

export interface RegistryFile {
  version: 1;
  projects: Project[];
}

export class ProjectRegistry {
  readonly memoryRoot: string;
  readonly registryPath: string;

  constructor(memoryRoot = path.join(process.cwd(), DEFAULT_MEMORY_ROOT_NAME)) {
    this.memoryRoot = normalizePath(memoryRoot);
    this.registryPath = path.join(this.memoryRoot, "global", "projects.json");
  }

  async ensure(): Promise<void> {
    await ensureDir(path.dirname(this.registryPath));
    if (!(await pathExists(this.registryPath))) {
      await this.save({ version: 1, projects: [] });
    }
  }

  async load(): Promise<RegistryFile> {
    await this.ensure();
    return readJson<RegistryFile>(this.registryPath, { version: 1, projects: [] });
  }

  async save(registry: RegistryFile): Promise<void> {
    await writeJson(this.registryPath, registry);
  }

  async listProjects(): Promise<Project[]> {
    const registry = await this.load();
    return registry.projects.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProject(projectId: ProjectId): Promise<Project | undefined> {
    const registry = await this.load();
    return registry.projects.find((project) => project.id === projectId);
  }

  async findByRepo(repoPath: string): Promise<Project | undefined> {
    const normalized = normalizePath(repoPath);
    const registry = await this.load();
    return registry.projects.find((project) =>
      project.repos.some((repo) => normalizePath(repo.path) === normalized)
    );
  }

  async register(project: Project): Promise<Project> {
    const registry = await this.load();
    const existingIndex = registry.projects.findIndex((candidate) => candidate.id === project.id);
    const nextProjects =
      existingIndex === -1
        ? [...registry.projects, project]
        : registry.projects.map((candidate) => (candidate.id === project.id ? project : candidate));
    await this.save({ version: 1, projects: nextProjects });
    return project;
  }

  async unregister(projectId: ProjectId): Promise<Project> {
    const registry = await this.load();
    const project = registry.projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    await this.save({
      version: 1,
      projects: registry.projects.filter((candidate) => candidate.id !== projectId)
    });
    return project;
  }

  async createModel(args: { name: string; repoPath?: string; slug?: string }): Promise<Project> {
    const slug = args.slug;
    const memoryRoot = path.join(this.memoryRoot, "projects", slug || args.name);
    return createProjectModel({
      name: args.name,
      slug,
      repoPath: args.repoPath,
      memoryRoot: normalizePath(memoryRoot)
    });
  }
}
