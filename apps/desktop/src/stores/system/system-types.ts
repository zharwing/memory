import type { OperationOutput } from "@zharwing/memory-core";

/** Result shape of `memory.list_backups`. */
export interface BackupSnapshotItem {
  projectId: string;
  created: string;
  snapshotPath: string;
  note: string;
}

export type DaemonHealth = OperationOutput<"memory.health">;
export type McpDoctor = OperationOutput<"memory.mcp_doctor">;
export type McpInstallResult = OperationOutput<"memory.mcp_install">;
