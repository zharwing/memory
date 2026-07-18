import type { Project } from "@zharwing/memory-core";
import type { ProjectRegistry } from "@zharwing/memory-store";

export async function resolveProject(registry: ProjectRegistry, projectId: string): Promise<Project> {
  const project = await registry.getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}
