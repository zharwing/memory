import type { ProjectRegistry } from "@zharwing/memory-store";
import {
  createProjectSnapshot,
  listProjectSnapshots,
  movePathToTrash
} from "@zharwing/memory-store";
import { resolveProject } from "./project-resolver.js";

export class BackupService {
  constructor(private readonly registry: ProjectRegistry) {}

  async backupProject(params: { projectId: string }) {
    return createProjectSnapshot(await resolveProject(this.registry, params.projectId));
  }

  async listBackups(params: { projectId: string }) {
    return listProjectSnapshots(await resolveProject(this.registry, params.projectId));
  }

  async deleteBackup(params: { projectId: string; snapshotPath: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const backups = await listProjectSnapshots(project);
    const backup = backups.find((candidate) => candidate.snapshotPath === params.snapshotPath);
    if (!backup) throw new Error(`Backup snapshot not found: ${params.snapshotPath}`);
    return movePathToTrash({
      memoryRoot: this.registry.memoryRoot,
      type: "backup",
      projectId: project.id,
      projectName: project.name,
      itemId: backup.created,
      title: `Snapshot ${backup.created}`,
      originalPath: backup.snapshotPath,
      critical: false
    });
  }
}
