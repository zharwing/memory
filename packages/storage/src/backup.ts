import path from "node:path";
import { isDefined, nowIso, type Project } from "@zharwing/memory-core";
import { promises as fs } from "node:fs";
import { ensureDir, listFiles, readJson, writeJson } from "./fs.js";

export interface BackupSnapshot {
  projectId: string;
  created: string;
  snapshotPath: string;
  note: string;
}

export async function createProjectSnapshot(project: Project): Promise<BackupSnapshot> {
  const safeTime = nowIso().replace(/[:.]/g, "-");
  const snapshotPath = path.join(project.memoryRoot, "backups", "snapshots", safeTime);
  await ensureDir(snapshotPath);
  await copyProjectContents(project.memoryRoot, snapshotPath);
  const snapshot: BackupSnapshot = {
    projectId: project.id,
    created: nowIso(),
    snapshotPath,
    note: "Directory snapshot. Zip export can be layered on this when an archive dependency is available."
  };
  await writeJson(path.join(snapshotPath, "backup-manifest.json"), snapshot);
  return snapshot;
}

export async function listProjectSnapshots(project: Project): Promise<BackupSnapshot[]> {
  const root = path.join(project.memoryRoot, "backups", "snapshots");
  const files = await listFiles(root, (file) => path.basename(file) === "backup-manifest.json");
  const snapshots = await Promise.all(files.map((file) => readJson<BackupSnapshot | undefined>(file, undefined)));
  return snapshots.filter(isDefined).sort((a, b) => b.created.localeCompare(a.created));
}

async function copyProjectContents(sourceRoot: string, destinationRoot: string): Promise<void> {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "backups") continue;
    const from = path.join(sourceRoot, entry.name);
    const to = path.join(destinationRoot, entry.name);
    if (entry.isDirectory()) {
      await ensureDir(to);
      await copyProjectContents(from, to);
    } else {
      await ensureDir(path.dirname(to));
      await fs.copyFile(from, to);
    }
  }
}
