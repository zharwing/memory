import type { OperationOutput } from "@zharwing/memory-core";

/** Element shape of `memory.list_backups`, owned by the core operation contract. */
export type BackupSnapshotItem = OperationOutput<"memory.list_backups">[number];

export type DaemonHealth = OperationOutput<"memory.health">;
export type McpDoctor = OperationOutput<"memory.mcp_doctor">;
export type McpInstallResult = OperationOutput<"memory.mcp_install">;
