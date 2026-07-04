import type { Project } from "@aimem/core";
import type { ProjectRegistry } from "@aimem/storage";

export async function resolveProject(registry: ProjectRegistry, projectId: string): Promise<Project> {
  const project = await registry.getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}
